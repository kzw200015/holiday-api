package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import com.github.kzw200015.javaapi.aihub.UpstreamProviderService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import okhttp3.*;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

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
    private final UpstreamProviderService upstreamProviderService;

    @PostConstruct
    public void validateConfig() {
        if (!StringUtils.hasText(properties.redirectUri())) {
            throw new IllegalStateException("缺少配置：codex.oauth.redirect-uri");
        }
    }

    public record AuthorizeUrlResult(String authorizeUrl, String state, String redirectUri, Instant expiresAt) {
    }

    public record CompleteResult(String accessToken, String refreshToken, String idToken, Long expiresInSeconds,
                                 String accountId) {
    }

    public AuthorizeUrlResult createAuthorizeUrl() {
        final PkceUtil.PkceCodes pkce = PkceUtil.generatePkce();
        final String state = PkceUtil.generateState();
        final Instant expiresAt = Instant.now().plusSeconds(properties.pendingTtlSeconds());
        pendingStore.put(new CodexOAuthPendingStore.PendingAuth(state, pkce.verifier(), expiresAt));

        final String authorizeUrl = buildAuthorizeUrl(properties.redirectUri(), pkce, state);
        return new AuthorizeUrlResult(authorizeUrl, state, properties.redirectUri(), expiresAt);
    }

    public CompleteResult completeFromCallbackUrl(String callbackUrl) {
        if (!StringUtils.hasText(callbackUrl)) {
            throw new IllegalArgumentException("callbackUrl 不能为空");
        }

        final URI uri;
        try {
            uri = URI.create(callbackUrl);
        } catch (Exception ex) {
            throw new IllegalArgumentException("callbackUrl 格式错误");
        }

        final Map<String, String> query = parseQuery(uri.getRawQuery());
        final String error = query.get("error");
        final String errorDescription = query.get("error_description");
        if (StringUtils.hasText(error)) {
            final String msg = StringUtils.hasText(errorDescription) ? errorDescription : error;
            throw new IllegalArgumentException(msg);
        }

        final String code = query.get("code");
        final String state = query.get("state");
        if (!StringUtils.hasText(code)) {
            throw new IllegalArgumentException("缺少授权 code");
        }
        if (!StringUtils.hasText(state)) {
            throw new IllegalArgumentException("缺少 state");
        }

        final CodexOAuthPendingStore.PendingAuth pending = pendingStore.consume(state);
        final TokenResponse tokens = exchangeCodeForTokens(code, properties.redirectUri(), properties.clientId(), pending.codeVerifier());
        final String accountId = JwtClaimsUtil.extractAccountId(jsonMapper, tokens.idToken(), tokens.accessToken());
        if (!StringUtils.hasText(accountId)) {
            throw new IllegalStateException("无法从 token 提取 accountId");
        }
        final CompleteResult result = new CompleteResult(tokens.accessToken(), tokens.refreshToken(), tokens.idToken(), tokens.expiresInSeconds(), accountId);
        upstreamProviderService.saveOauthJson(tokens.oauthJson());
        return result;
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

    private record TokenResponse(String idToken, String accessToken, String refreshToken, Long expiresInSeconds,
                                 Map<String, Object> oauthJson) {
    }

    private TokenResponse exchangeCodeForTokens(String code, String redirectUri, String clientId, String codeVerifier) {
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
                throw new IllegalStateException("Token exchange failed: status=" + response.code());
            }
            final ResponseBody responseBody = response.body();
            if (responseBody == null) {
                throw new IllegalStateException("Token exchange failed: empty body");
            }
            final byte[] bytes = responseBody.bytes();
            final Map<String, Object> map = jsonMapper.readValue(bytes, new TypeReference<>() {
            });
            final String idToken = asString(map.get("id_token"));
            final String accessToken = asString(map.get("access_token"));
            final String refreshToken = asString(map.get("refresh_token"));
            final Long expiresIn = asLong(map.get("expires_in"));
            return new TokenResponse(idToken, accessToken, refreshToken, expiresIn, map);
        } catch (Exception ex) {
            throw new IllegalStateException("Token exchange failed", ex);
        }
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        final Map<String, String> map = new HashMap<>();
        if (!StringUtils.hasText(rawQuery)) {
            return map;
        }
        final String[] pairs = rawQuery.split("&");
        for (String pair : pairs) {
            if (pair.isEmpty()) {
                continue;
            }
            final int idx = pair.indexOf("=");
            final String k = idx >= 0 ? pair.substring(0, idx) : pair;
            final String v = idx >= 0 ? pair.substring(idx + 1) : "";
            map.put(urlDecode(k), urlDecode(v));
        }
        return map;
    }

    private static String urlDecode(String s) {
        return URLDecoder.decode(s, StandardCharsets.UTF_8);
    }

    private static String asString(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Long asLong(Object v) {
        if (v instanceof Number n) {
            return n.longValue();
        }
        if (v == null) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (Exception ex) {
            return null;
        }
    }
}
