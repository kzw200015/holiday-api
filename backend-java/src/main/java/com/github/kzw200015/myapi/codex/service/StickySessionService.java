package com.github.kzw200015.myapi.codex.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 粘性会话：依据 session_id / conversation_id / prompt_cache_key 绑定账号一段时间。
 */
@Service
public class StickySessionService {
    private static final Duration DEFAULT_STICKY_TTL = Duration.ofHours(1);

    private final Duration stickyTtl = DEFAULT_STICKY_TTL;
    private final ConcurrentMap<String, StickyBinding> bindings = new ConcurrentHashMap<>();

    public String extractKey(HttpServletRequest request, String promptCacheKey) {
        String sessionId = trim(request.getHeader("session_id"));
        if (!sessionId.isBlank()) {
            return hashValue(sessionId);
        }

        String conversationId = trim(request.getHeader("conversation_id"));
        if (!conversationId.isBlank()) {
            return hashValue(conversationId);
        }

        String prompt = trim(promptCacheKey);
        if (!prompt.isBlank()) {
            return hashValue(prompt);
        }

        return "";
    }

    private static String hashValue(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] sum = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(sum);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    public void setBinding(String stickyKey, String accountId) {
        bindings.put(stickyKey, new StickyBinding(accountId, OffsetDateTime.now().plus(stickyTtl)));
    }

    public BindingResult getBindingAccountId(String stickyKey) {
        StickyBinding binding = bindings.get(stickyKey);
        if (binding == null) {
            return new BindingResult("", false);
        }

        OffsetDateTime now = OffsetDateTime.now();
        if (now.isAfter(binding.expiresAt())) {
            bindings.remove(stickyKey, binding);
            return new BindingResult("", false);
        }

        return new BindingResult(binding.accountId(), true);
    }

    public void deleteBinding(String stickyKey) {
        bindings.remove(stickyKey);
    }

    @Scheduled(fixedDelay = 60_000)
    private void cleanupExpiredBindings() {
        OffsetDateTime now = OffsetDateTime.now();
        bindings.entrySet().removeIf(entry -> now.isAfter(entry.getValue().expiresAt()));
    }

    private static String trim(String raw) {
        return raw == null ? "" : raw.trim();
    }
}
