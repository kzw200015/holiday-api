package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import com.github.kzw200015.javaapi.aihub.AccountService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import okhttp3.*;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;

/**
 * Codex OAuth2 流程服务。
 */
@Service
@RequiredArgsConstructor
public class CodexOAuthService {

    private final OkHttpClient httpClient;
    private final JsonMapper jsonMapper;
    private final CodexOAuthProperties properties;
    private final CodexOAuthPendingStore pendingStore;
    private final AccountService accountService;

    @PostConstruct
    public void validateConfig() {
        if (!StringUtils.hasText(properties.redirectUri())) {
            throw new IllegalStateException("缺少配置：codex.oauth.redirect-uri");
        }
    }

    public record AuthorizeUrlResult(String authorizeUrl, String state, String redirectUri, Instant expiresAt) {
    }

    public AuthorizeUrlResult createAuthorizeUrl() {
        final PkceUtil.PkceCodes pkce = PkceUtil.generatePkce();
        final String state = PkceUtil.generateState();
        final Instant expiresAt = Instant.now().plusSeconds(properties.pendingTtlSeconds());
        pendingStore.put(state, pkce.verifier(), expiresAt);

        final String authorizeUrl = buildAuthorizeUrl(properties.redirectUri(), pkce, state);
        return new AuthorizeUrlResult(authorizeUrl, state, properties.redirectUri(), expiresAt);
    }

    public void completeFromCallbackUrl(String callbackUrl, String name) {
        if (!StringUtils.hasText(callbackUrl)) {
            throw new IllegalArgumentException("callbackUrl 不能为空");
        }

        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException("name 不能为空");
        }

        final HttpUrl url;
        try {
            url = HttpUrl.get(callbackUrl);
        } catch (Exception ex) {
            throw new IllegalArgumentException("callbackUrl 格式错误");
        }

        final String error = url.queryParameter("error");
        final String errorDescription = url.queryParameter("error_description");
        if (StringUtils.hasText(error)) {
            final String msg = StringUtils.hasText(errorDescription) ? errorDescription : error;
            throw new IllegalArgumentException(msg);
        }

        final String code = url.queryParameter("code");
        final String state = url.queryParameter("state");
        if (!StringUtils.hasText(code)) {
            throw new IllegalArgumentException("缺少授权 code");
        }
        if (!StringUtils.hasText(state)) {
            throw new IllegalArgumentException("缺少 state");
        }

        final String codeVerifier = pendingStore.consumeCodeVerifier(state);
        final CodexOAuthToken tokens = exchangeCodeForTokens(code, properties.redirectUri(), properties.clientId(), codeVerifier);
        accountService.createOauthAccount(name, tokens);
    }

    private String buildAuthorizeUrl(String redirectUri, PkceUtil.PkceCodes pkce, String state) {
        final HttpUrl base = HttpUrl.get(properties.issuer() + "/oauth/authorize");
        return base.newBuilder()
                .addQueryParameter("response_type", "code")
                .addQueryParameter("client_id", properties.clientId())
                .addQueryParameter("redirect_uri", redirectUri)
                .addQueryParameter("scope", properties.scope())
                .addQueryParameter("code_challenge", pkce.challenge())
                .addQueryParameter("code_challenge_method", "S256")
                .addQueryParameter("id_token_add_organizations", "true")
                .addQueryParameter("codex_cli_simplified_flow", "true")
                .addQueryParameter("state", state)
                .addQueryParameter("originator", properties.originator())
                .build()
                .toString();
    }

    private CodexOAuthToken exchangeCodeForTokens(String code, String redirectUri, String clientId, String codeVerifier) {
        final HttpUrl url = HttpUrl.get(properties.issuer() + "/oauth/token");
        final FormBody body = new FormBody.Builder()
                .add("grant_type", "authorization_code")
                .add("code", code)
                .add("redirect_uri", redirectUri)
                .add("client_id", clientId)
                .add("code_verifier", codeVerifier)
                .build();

        final Request request = new Request.Builder()
                .url(url)
                .post(body)
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IllegalStateException("token 交换失败：status=" + response.code());
            }
            final byte[] bytes = response.body().bytes();
            return jsonMapper.readValue(bytes, CodexOAuthToken.class);
        } catch (Exception ex) {
            throw new IllegalStateException("token 交换失败", ex);
        }
    }

}
