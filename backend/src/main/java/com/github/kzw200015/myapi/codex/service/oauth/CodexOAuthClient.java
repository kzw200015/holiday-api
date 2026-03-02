package com.github.kzw200015.myapi.codex.service.oauth;

import com.github.kzw200015.myapi.codex.dto.oauth.TokenResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.json.JsonMapper;

@Service
@RequiredArgsConstructor
public class CodexOAuthClient {
    private static final String OPENAI_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
    private static final String OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token";
    private static final String OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
    private static final String OPENAI_REFRESH_SCOPE = "openid profile email";
    private static final String REDIRECT_URI = "http://localhost:1455/auth/callback";
    private static final String TOKEN_REQUEST_USER_AGENT = "codex-cli/0.91.0";

    private final RestClient restClient;
    private final JsonMapper jsonMapper;

    public String buildAuthorizeUrl(String state, String codeChallenge) {
        return UriComponentsBuilder.fromUriString(OPENAI_AUTHORIZE_URL)
                .queryParam("client_id", OPENAI_CLIENT_ID)
                .queryParam("response_type", "code")
                .queryParam("redirect_uri", REDIRECT_URI)
                .queryParam("scope", "openid email profile offline_access")
                .queryParam("state", state)
                .queryParam("code_challenge", codeChallenge)
                .queryParam("code_challenge_method", "S256")
                .queryParam("prompt", "login")
                .queryParam("id_token_add_organizations", "true")
                .queryParam("codex_cli_simplified_flow", "true")
                .build()
                .encode()
                .toUriString();
    }

    public TokenExchange exchangeCodeForTokens(String code, String codeVerifier) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", OPENAI_CLIENT_ID);
        form.add("code", code.trim());
        form.add("redirect_uri", REDIRECT_URI);
        form.add("code_verifier", codeVerifier);
        return requestTokens(form, "token 交换失败");
    }

    public TokenExchange refreshTokens(String refreshToken) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "refresh_token");
        form.add("client_id", OPENAI_CLIENT_ID);
        form.add("refresh_token", refreshToken);
        form.add("scope", OPENAI_REFRESH_SCOPE);
        return requestTokens(form, "token 刷新失败");
    }

    private TokenExchange requestTokens(MultiValueMap<String, String> form, String actionName) {
        String raw;
        try {
            raw = restClient.post()
                    .uri(OPENAI_TOKEN_URL)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.APPLICATION_JSON)
                    .header("User-Agent", TOKEN_REQUEST_USER_AGENT)
                    .body(form)
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException ex) {
            throw new IllegalArgumentException(actionName + ": status=" + ex.getStatusCode().value());
        }

        TokenResponse parsed = jsonMapper.readValue(raw, TokenResponse.class);
        return new TokenExchange(raw, parsed);
    }

    public record TokenExchange(String rawJson, TokenResponse parsed) {}
}
