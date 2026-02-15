package com.github.kzw200015.myapi.codex.service.oauth;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.github.kzw200015.myapi.codex.dao.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.dao.entity.CodexOAuthSessionEntity;
import com.github.kzw200015.myapi.codex.dao.mapper.CodexAccountMapper;
import com.github.kzw200015.myapi.codex.dao.mapper.CodexOAuthSessionMapper;
import com.github.kzw200015.myapi.codex.dto.account.Account;
import com.github.kzw200015.myapi.codex.dto.oauth.OAuthCallback;
import com.github.kzw200015.myapi.codex.dto.oauth.OAuthSessionInfo;
import com.github.kzw200015.myapi.codex.dto.oauth.TokenResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;

import static com.github.kzw200015.myapi.common.util.ValidationUtils.requireNonBlank;

@Service
@Slf4j
@RequiredArgsConstructor
public class CodexOAuthService {
    private static final Duration OAUTH_SESSION_TTL = Duration.ofMinutes(10);

    private final CodexAccountMapper codexAccountMapper;
    private final CodexOAuthSessionMapper codexOAuthSessionMapper;
    private final CodexOAuthClient codexOAuthClient;
    private final JsonMapper jsonMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    public OAuthSessionInfo createOAuthSession() {
        String state = generateRandomState();
        PKCECodes pkce = generatePkceCodes();
        String url = codexOAuthClient.buildAuthorizeUrl(state, pkce.codeChallenge());

        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime expiresAt = now.plus(OAUTH_SESSION_TTL);
        CodexOAuthSessionEntity session = new CodexOAuthSessionEntity();
        session.setState(state);
        session.setCodeVerifier(pkce.codeVerifier());
        session.setCodeChallenge(pkce.codeChallenge());
        session.setExpiresAt(expiresAt);
        session.setCreatedAt(now);
        codexOAuthSessionMapper.insert(session);

        return new OAuthSessionInfo(state, url, expiresAt);
    }

    public Account completeOAuth(String name, String redirectUrl) {
        OAuthCallback callback = parseAndValidateCallback(redirectUrl);
        String state = requireNonBlank(callback.state(), "回调地址缺少 state");
        String code = requireNonBlank(callback.code(), "回调地址缺少 code");

        OffsetDateTime now = OffsetDateTime.now();
        CodexOAuthSessionEntity session = loadValidSession(state, now);

        CodexOAuthClient.TokenExchange exchange = codexOAuthClient.exchangeCodeForTokens(code, session.getCodeVerifier());
        TokenResponse tokens = exchange.parsed();
        requireNonBlank(tokens.accessToken(), "token 响应缺少 access_token");
        requireNonBlank(tokens.idToken(), "token 响应缺少 id_token");

        String accountId = requireNonBlank(extractAccountIdFromIdToken(tokens.idToken()), "token 缺少 account id");

        CodexAccountEntity entity = upsertAccount(name, accountId, tokens, exchange.rawJson(), now);

        codexOAuthSessionMapper.deleteById(session.getId());
        return Account.from(entity);
    }

    public int refreshExpiringTokens(Duration refreshWindow) {
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime cutoffTime = now.plus(refreshWindow);
        List<CodexAccountEntity> accounts = codexAccountMapper.selectList(
                Wrappers.<CodexAccountEntity>lambdaQuery()
                        .le(CodexAccountEntity::getExpiresAt, cutoffTime)
                        .orderByAsc(CodexAccountEntity::getExpiresAt)
        );

        int refreshedCount = 0;
        for (CodexAccountEntity account : accounts) {
            try {
                refreshAccountToken(account);
                refreshedCount++;
            } catch (Exception ex) {
                log.warn("刷新账号 token 失败 accountId={}: {}", account.getAccountId(), ex.getMessage());
            }
        }
        return refreshedCount;
    }

    private void refreshAccountToken(CodexAccountEntity account) {
        String refreshToken = requireNonBlank(
                account.getOauthPayload().path("refresh_token").asString(),
                "账号缺少 refresh_token"
        );
        CodexOAuthClient.TokenExchange refreshResult = codexOAuthClient.refreshTokens(refreshToken);
        TokenResponse refreshedToken = refreshResult.parsed();
        requireNonBlank(refreshedToken.accessToken(), "token 响应缺少 access_token");

        OffsetDateTime now = OffsetDateTime.now();
        account.setToken(refreshedToken.accessToken());
        account.setExpiresAt(now.plusSeconds(refreshedToken.expiresIn()));
        account.setOauthPayload(jsonMapper.readTree(refreshResult.rawJson()));
        account.setUpdatedAt(now);
        codexAccountMapper.updateById(account);
    }

    private OAuthCallback parseAndValidateCallback(String redirectUrl) {
        OAuthCallback callback = OAuthCallback.parse(redirectUrl);
        String error = trim(callback.error());
        if (error.isBlank()) {
            return callback;
        }

        String errorDesc = trim(callback.errorDescription());
        if (!errorDesc.isBlank()) {
            throw new IllegalArgumentException("OAuth 失败: " + error + " (" + errorDesc + ")");
        }
        throw new IllegalArgumentException("OAuth 失败: " + error);
    }

    private CodexOAuthSessionEntity loadValidSession(String state, OffsetDateTime now) {
        CodexOAuthSessionEntity session = codexOAuthSessionMapper.selectOne(
                Wrappers.<CodexOAuthSessionEntity>lambdaQuery().eq(CodexOAuthSessionEntity::getState, state)
        );
        if (session == null) {
            throw new IllegalArgumentException("OAuth 会话不存在或已过期");
        }
        if (now.isAfter(session.getExpiresAt())) {
            codexOAuthSessionMapper.deleteById(session.getId());
            throw new IllegalArgumentException("OAuth 会话已过期");
        }
        return session;
    }

    private CodexAccountEntity upsertAccount(
            String name,
            String accountId,
            TokenResponse tokens,
            String oauthPayload,
            OffsetDateTime now
    ) {
        OffsetDateTime expiresAt = now.plusSeconds(tokens.expiresIn());
        CodexAccountEntity entity = codexAccountMapper.selectOne(
                Wrappers.<CodexAccountEntity>lambdaQuery().eq(CodexAccountEntity::getAccountId, accountId)
        );
        boolean exists = entity != null;
        if (!exists) {
            entity = new CodexAccountEntity();
            entity.setAccountId(accountId);
            entity.setEnabled(true);
            entity.setCreatedAt(now);
        }

        entity.setName(name);
        entity.setToken(tokens.accessToken());
        entity.setExpiresAt(expiresAt);
        entity.setOauthPayload(jsonMapper.readTree(oauthPayload));
        entity.setUpdatedAt(now);
        if (exists) {
            codexAccountMapper.updateById(entity);
        } else {
            codexAccountMapper.insert(entity);
        }
        return entity;
    }

    private String extractAccountIdFromIdToken(String idToken) {
        String[] parts = idToken.split("\\.");
        if (parts.length != 3) {
            throw new IllegalArgumentException("id_token 格式错误");
        }

        byte[] payloadBytes;
        try {
            payloadBytes = java.util.Base64.getUrlDecoder().decode(parts[1]);
        } catch (Exception ex) {
            throw new IllegalArgumentException("解析 id_token 失败: " + ex.getMessage(), ex);
        }

        JsonNode claims = jsonMapper.readTree(payloadBytes);
        JsonNode auth = claims.get("https://api.openai.com/auth");
        if (auth == null) {
            return "";
        }
        JsonNode accountId = auth.get("chatgpt_account_id");
        if (accountId == null) {
            return "";
        }
        return accountId.asString();
    }

    private String generateRandomState() {
        byte[] bytes = new byte[16];
        secureRandom.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    private PKCECodes generatePkceCodes() {
        byte[] bytes = new byte[64];
        secureRandom.nextBytes(bytes);
        String verifier = HexFormat.of().formatHex(bytes);
        String challenge = base64UrlNoPadding(sha256(verifier.getBytes(StandardCharsets.UTF_8)));
        return new PKCECodes(verifier, challenge);
    }

    private static String trim(String raw) {
        return raw == null ? "" : raw.trim();
    }

    private static byte[] sha256(byte[] raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return digest.digest(raw);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String base64UrlNoPadding(byte[] raw) {
        return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    private record PKCECodes(String codeVerifier, String codeChallenge) {
    }
}
