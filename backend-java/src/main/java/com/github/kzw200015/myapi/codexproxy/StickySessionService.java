package com.github.kzw200015.myapi.codexproxy;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 粘性会话：依据 session_id / conversation_id / prompt_cache_key 绑定账号一段时间。
 */
public class StickySessionService {
    private final Duration stickyTtl;
    private final Map<String, StickyBinding> bindings;

    public StickySessionService(Duration stickyTtl) {
        this.stickyTtl = stickyTtl;
        this.bindings = new HashMap<>();
    }

    public String extractKey(HttpServletRequest request, String promptCacheKey) {
        String sessionId = trim(request.getHeader("session_id"));
        if (!sessionId.isBlank()) {
            return hashValue(sessionId);
        }

        String conversationId = trim(request.getHeader("conversation_id"));
        if (!conversationId.isBlank()) {
            return hashValue(conversationId);
        }

        if (promptCacheKey != null && !promptCacheKey.trim().isBlank()) {
            return hashValue(promptCacheKey.trim());
        }

        return "";
    }

    public String hashValue(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] sum = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(sum);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    public void setBinding(String stickyKey, String accountId) {
        synchronized (bindings) {
            bindings.put(stickyKey, new StickyBinding(accountId, OffsetDateTime.now().plus(stickyTtl)));
        }
    }

    public BindingResult getBindingAccountId(String stickyKey) {
        synchronized (bindings) {
            StickyBinding binding = bindings.get(stickyKey);
            if (binding == null) {
                return new BindingResult("", false);
            }
            if (OffsetDateTime.now().isAfter(binding.expiresAt())) {
                bindings.remove(stickyKey);
                return new BindingResult("", false);
            }
            return new BindingResult(binding.accountId(), true);
        }
    }

    public void deleteBinding(String stickyKey) {
        synchronized (bindings) {
            bindings.remove(stickyKey);
        }
    }

    private static String trim(String raw) {
        return raw == null ? "" : raw.trim();
    }

    private record StickyBinding(String accountId, OffsetDateTime expiresAt) {}

    public record BindingResult(String accountId, boolean found) {}
}
