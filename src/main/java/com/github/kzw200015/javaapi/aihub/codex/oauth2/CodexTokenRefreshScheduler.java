package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import com.github.kzw200015.javaapi.aihub.AccountAuthType;
import com.github.kzw200015.javaapi.aihub.AccountEntity;
import com.github.kzw200015.javaapi.aihub.AccountService;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tools.jackson.databind.json.JsonMapper;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Codex OAuth2 token 定时刷新。
 * <p>
 * 统一由定时任务刷新 token，避免在请求链路中并发刷新导致的竞争与抖动。
 */
@Component
@Slf4j
public class CodexTokenRefreshScheduler {

    /**
     * 提前刷新窗口：token 过期时间落入该窗口时触发刷新。
     */
    private static final long REFRESH_BEFORE_SECONDS = 300;

    /**
     * 账号用于反代的最小 token 剩余有效期。
     */
    private static final long MIN_TTL_SECONDS = 60;

    /**
     * 刷新间隔。
     */
    private static final long FIXED_DELAY_MILLIS = 60_000L;

    private final AccountService accountService;
    private final OkHttpClient httpClient;
    private final JsonMapper jsonMapper;
    private final CodexOAuthProperties properties;
    private final CodexAccountCache accountCache;

    public CodexTokenRefreshScheduler(AccountService accountService, OkHttpClient httpClient,
                                      JsonMapper jsonMapper, CodexOAuthProperties properties,
                                      CodexAccountCache accountCache) {
        this.accountService = accountService;
        this.httpClient = httpClient;
        this.jsonMapper = jsonMapper;
        this.properties = properties;
        this.accountCache = accountCache;
    }

    
    @Scheduled(fixedDelay = FIXED_DELAY_MILLIS)
    private void safeRefresh() {
        try {
            refreshTokens();
        } catch (Exception ex) {
            log.error("Codex token 刷新失败", ex);
        }
    }

    private void refreshTokens() {
        refreshExpiringAccounts();
        refreshCache();
    }

    public void refreshAccountToken(String accountId) {
        if (accountId == null || accountId.isBlank()) {
            throw new IllegalArgumentException("accountId 不能为空");
        }

        final AccountEntity account = accountService.getById(accountId);
        if (account == null) {
            throw new IllegalArgumentException("账号不存在");
        }

        final CodexOAuthToken oauthJson = account.getOauthJson();
        if (oauthJson == null) {
            throw new IllegalStateException("账号缺少 oauthJson");
        }

        final String refreshToken = oauthJson.refreshToken();
        if (!StringUtils.hasText(refreshToken)) {
            throw new IllegalStateException("账号缺少 refresh_token");
        }

        final CodexOAuthToken refreshed = refreshAccessToken(refreshToken);
        accountService.updateOauthJsonAndExpiresAt(accountId, refreshed);
        refreshCache();
    }

    private void refreshExpiringAccounts() {
        final OffsetDateTime now = OffsetDateTime.now();
        final OffsetDateTime threshold = now.plusSeconds(REFRESH_BEFORE_SECONDS);
        final List<AccountEntity> expiring = accountService.lambdaQuery()
                .eq(AccountEntity::getAuthType, AccountAuthType.OAUTH.dbValue())
                .le(AccountEntity::getAccessTokenExpiresAt, threshold)
                .orderByAsc(AccountEntity::getCreateTime)
                .list();
        if (expiring == null || expiring.isEmpty()) {
            return;
        }

        for (AccountEntity account : expiring) {
            final CodexOAuthToken oauthJson = account.getOauthJson();
            if (oauthJson == null) {
                continue;
            }

            final String refreshToken = oauthJson.refreshToken();
            if (!StringUtils.hasText(refreshToken)) {
                log.warn("账号缺少 refresh_token，跳过刷新：id={}, name={}", account.getId(), account.getName());
                continue;
            }

            try {
                final CodexOAuthToken refreshed = refreshAccessToken(refreshToken);
                accountService.updateOauthJsonAndExpiresAt(account.getId(), refreshed);

                log.info("账号 token 刷新成功：id={}, name={}", account.getId(), account.getName());
            } catch (Exception ex) {
                log.error("账号 token 刷新失败：id={}, name={}", account.getId(), account.getName(), ex);
            }
        }
    }

    private void refreshCache() {
        final OffsetDateTime now = OffsetDateTime.now();
        final OffsetDateTime usableThreshold = now.plusSeconds(MIN_TTL_SECONDS);
        final List<AccountEntity> usable = accountService.lambdaQuery()
                .eq(AccountEntity::getAuthType, AccountAuthType.OAUTH.dbValue())
                .gt(AccountEntity::getAccessTokenExpiresAt, usableThreshold)
                .orderByAsc(AccountEntity::getCreateTime)
                .list();

        final List<CodexAccountCache.CachedAccount> cached = usable.stream()
                .map(this::toCachedAccount)
                .filter(it -> it != null && StringUtils.hasText(it.accessToken()))
                .toList();

        accountCache.replaceAll(cached);
    }

    private CodexAccountCache.CachedAccount toCachedAccount(AccountEntity account) {
        final CodexOAuthToken oauthJson = account.getOauthJson();
        if (oauthJson == null) {
            return null;
        }
        final String accessToken = oauthJson.accessToken();
        if (!StringUtils.hasText(accessToken)) {
            return null;
        }
        final String chatgptAccountId = JwtClaimsUtil.extractAccountId(jsonMapper, oauthJson.idToken(), accessToken);
        return new CodexAccountCache.CachedAccount(account.getId(), accessToken, chatgptAccountId);
    }

    private CodexOAuthToken refreshAccessToken(String refreshToken) {
        final HttpUrl url = HttpUrl.get(properties.issuer() + "/oauth/token");
        final FormBody body = new FormBody.Builder()
                .add("grant_type", "refresh_token")
                .add("refresh_token", refreshToken)
                .add("client_id", properties.clientId())
                .build();

        final Request request = new Request.Builder().url(url).post(body).build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IllegalStateException("Token refresh failed: status=" + response.code());
            }
            final ResponseBody responseBody = response.body();
            final byte[] bytes = responseBody.bytes();
            return jsonMapper.readValue(bytes, CodexOAuthToken.class);
        } catch (Exception ex) {
            throw new IllegalStateException("Token refresh failed", ex);
        }
    }
}
