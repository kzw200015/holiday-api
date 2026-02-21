package com.github.kzw200015.myapi.codex.dto.oauth;

import org.jspecify.annotations.NonNull;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * 从浏览器回调 URL 解析出的参数。
 */
public record OAuthCallback(String code, String state, String error, String errorDescription) {
    public static OAuthCallback parse(String input) {
        final String candidate = getCandidate(input);

        URI uri = URI.create(candidate);

        Map<String, String> query = parseQuery(uri.getQuery());
        String code = trim(query.get("code"));
        String state = trim(query.get("state"));
        String err = trim(query.get("error"));
        String errDesc = trim(query.get("error_description"));

        if (uri.getFragment() != null && !uri.getFragment().isBlank()) {
            Map<String, String> frag = parseQuery(uri.getFragment());
            if (code.isBlank()) {
                code = trim(frag.get("code"));
            }
            if (state.isBlank()) {
                state = trim(frag.get("state"));
            }
            if (err.isBlank()) {
                err = trim(frag.get("error"));
            }
            if (errDesc.isBlank()) {
                errDesc = trim(frag.get("error_description"));
            }
        }

        if (err.isBlank() && !errDesc.isBlank()) {
            err = errDesc;
            errDesc = "";
        }

        if (code.isBlank() && err.isBlank()) {
            throw new IllegalArgumentException("回调地址缺少 code");
        }

        return new OAuthCallback(code, state, err, errDesc);
    }

    private static @NonNull String getCandidate(String input) {
        String trimmed = input == null ? "" : input.trim();
        if (trimmed.isBlank()) {
            throw new IllegalArgumentException("回调地址不能为空");
        }

        String candidate = trimmed;
        if (!candidate.contains("://")) {
            if (candidate.startsWith("?")) {
                candidate = "http://localhost" + candidate;
            } else if (candidate.contains("=")) {
                candidate = "http://localhost/?" + candidate;
            } else {
                throw new IllegalArgumentException("回调地址格式错误");
            }
        }
        return candidate;
    }

    private static Map<String, String> parseQuery(String raw) {
        Map<String, String> out = new HashMap<>();
        if (raw == null || raw.isBlank()) {
            return out;
        }

        for (String pair : raw.split("&")) {
            if (pair.isBlank()) {
                continue;
            }
            int sep = pair.indexOf('=');
            if (sep < 0) {
                out.put(urlDecode(pair), "");
                continue;
            }
            String key = urlDecode(pair.substring(0, sep));
            String val = urlDecode(pair.substring(sep + 1));
            out.put(key, val);
        }
        return out;
    }

    private static String urlDecode(String raw) {
        return URLDecoder.decode(raw, StandardCharsets.UTF_8);
    }

    private static String trim(String raw) {
        return raw == null ? "" : raw.trim();
    }
}
