package com.github.kzw200015.myapi.codex.service;

import static com.github.kzw200015.myapi.common.util.ValidationUtils.requireNonBlank;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.kzw200015.myapi.codex.exception.AccountNotFoundException;
import com.github.kzw200015.myapi.codex.model.Account;
import com.github.kzw200015.myapi.codex.model.OAuthCallback;
import com.github.kzw200015.myapi.codex.model.OAuthSessionInfo;
import com.github.kzw200015.myapi.codex.model.TokenResponse;
import com.github.kzw200015.myapi.codex.model.UpdateAccountRequest;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.model.entity.CodexOAuthSessionEntity;
import com.github.kzw200015.myapi.codex.model.mapper.CodexAccountMapper;
import com.github.kzw200015.myapi.codex.model.mapper.CodexOAuthSessionMapper;
import com.github.kzw200015.myapi.common.model.PaginatedResult;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;

/**
 * Codex OAuth 流程与账户存储。
 */
@Service
@RequiredArgsConstructor
public class CodexService {
    private static final Duration OAUTH_SESSION_TTL = Duration.ofMinutes(10);

    private static final String OPENAI_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
    private static final String OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
    private static final String OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
    private static final String REDIRECT_URI = "http://localhost:1455/auth/callback";

    private final CodexAccountMapper codexAccountMapper;
    private final CodexOAuthSessionMapper codexOAuthSessionMapper;
    private final JsonMapper jsonMapper;
    private final RestClient restClient = RestClient.create();
    private final SecureRandom secureRandom = new SecureRandom();

    public OAuthSessionInfo createOAuthSession() {
        String state = generateRandomState();
        PKCECodes pkce = generatePkceCodes();
        String url = buildAuthorizeUrl(state, pkce);

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
        OAuthCallback callback = OAuthCallback.parse(redirectUrl);
        String error = trim(callback.error());
        if (!error.isBlank()) {
            String errorDesc = trim(callback.errorDescription());
            if (!errorDesc.isBlank()) {
                throw new IllegalArgumentException("OAuth 失败: " + error + " (" + errorDesc + ")");
            }
            throw new IllegalArgumentException("OAuth 失败: " + error);
        }

        String state = requireNonBlank(callback.state(), "回调地址缺少 state");
        String code = requireNonBlank(callback.code(), "回调地址缺少 code");

        CodexOAuthSessionEntity session = codexOAuthSessionMapper.selectOne(
                Wrappers.<CodexOAuthSessionEntity>lambdaQuery().eq(CodexOAuthSessionEntity::getState, state)
        );
        if (session == null) {
            throw new IllegalArgumentException("OAuth 会话不存在或已过期");
        }
        OffsetDateTime now = OffsetDateTime.now();
        if (now.isAfter(session.getExpiresAt())) {
            codexOAuthSessionMapper.deleteById(session.getId());
            throw new IllegalArgumentException("OAuth 会话已过期");
        }

        TokenExchangeResult exchange = exchangeCodeForTokens(code, new PKCECodes(session.getCodeVerifier(), session.getCodeChallenge()));
        TokenResponse tokens = exchange.parsed();
        requireNonBlank(tokens.accessToken(), "token 响应缺少 access_token");
        requireNonBlank(tokens.idToken(), "token 响应缺少 id_token");

        String accountId = requireNonBlank(extractAccountIdFromIdToken(tokens.idToken()), "token 缺少 account id");

        OffsetDateTime expiresAt = now.plusSeconds(tokens.expiresIn());

        CodexAccountEntity entity = codexAccountMapper.selectOne(
                Wrappers.<CodexAccountEntity>lambdaQuery().eq(CodexAccountEntity::getAccountId, accountId)
        );
        boolean exists = entity != null;
        if (!exists) {
            entity = new CodexAccountEntity();
            entity.setAccountId(accountId);
            entity.setCreatedAt(now);
        }
        entity.setName(name);
        entity.setToken(tokens.accessToken());
        entity.setExpiresAt(expiresAt);
        entity.setOauthPayload(jsonMapper.readTree(exchange.rawJson()));
        entity.setUpdatedAt(now);

        if (exists) {
            codexAccountMapper.updateById(entity);
        } else {
            codexAccountMapper.insert(entity);
        }

        codexOAuthSessionMapper.deleteById(session.getId());

        return Account.from(entity);
    }

    public PaginatedResult<Account> listAccountsPage(int page, int pageSize) {
        Page<CodexAccountEntity> pageResult = codexAccountMapper.selectPage(
                Page.of(page, pageSize),
                Wrappers.<CodexAccountEntity>lambdaQuery().orderByDesc(CodexAccountEntity::getCreatedAt)
        );
        List<Account> items = pageResult.getRecords().stream().map(Account::from).toList();
        return new PaginatedResult<>(items, pageResult.getTotal(), page, pageSize);
    }

    public Account updateAccount(String accountId, UpdateAccountRequest req) {
        CodexAccountEntity entity = codexAccountMapper.selectOne(
                Wrappers.<CodexAccountEntity>lambdaQuery().eq(CodexAccountEntity::getAccountId, accountId)
        );
        if (entity == null) {
            throw new AccountNotFoundException();
        }
        entity.setName(req.name());
        entity.setUpdatedAt(OffsetDateTime.now());
        codexAccountMapper.updateById(entity);
        return Account.from(entity);
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

    private String buildAuthorizeUrl(String state, PKCECodes pkce) {
        return UriComponentsBuilder.fromUriString(OPENAI_AUTHORIZE_URL)
                .queryParam("client_id", OPENAI_CLIENT_ID)
                .queryParam("response_type", "code")
                .queryParam("redirect_uri", REDIRECT_URI)
                .queryParam("scope", "openid email profile offline_access")
                .queryParam("state", state)
                .queryParam("code_challenge", pkce.codeChallenge())
                .queryParam("code_challenge_method", "S256")
                .queryParam("prompt", "login")
                .queryParam("id_token_add_organizations", "true")
                .queryParam("codex_cli_simplified_flow", "true")
                .build(true)
                .toUriString();
    }

    private TokenExchangeResult exchangeCodeForTokens(String code, PKCECodes pkce) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", OPENAI_CLIENT_ID);
        form.add("code", code.trim());
        form.add("redirect_uri", REDIRECT_URI);
        form.add("code_verifier", pkce.codeVerifier());

        String raw;
        try {
            raw = restClient.post()
                    .uri(OPENAI_TOKEN_URL)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.APPLICATION_JSON)
                    .header("User-Agent", "codex-cli/0.91.0")
                    .body(form)
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException ex) {
            throw new IllegalArgumentException("token 交换失败: status=" + ex.getStatusCode().value());
        }

        TokenResponse parsed = jsonMapper.readValue(raw, TokenResponse.class);

        return new TokenExchangeResult(raw, parsed);
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
}
