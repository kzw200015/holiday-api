package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * state -> PKCE/code_verifier 的临时存储。
 */
public class CodexOAuthPendingStore {

    private final Map<String, PendingAuth> pendingByState = new ConcurrentHashMap<>();

    public record PendingAuth(String state, String codeVerifier, Instant expiresAt) {
    }

    public void put(PendingAuth pending) {
        pendingByState.put(pending.state(), pending);
    }

    public PendingAuth consume(String state) {
        cleanupExpired();
        final PendingAuth pending = pendingByState.remove(state);
        if (pending == null) {
            throw new IllegalArgumentException("state 无效或已过期");
        }
        if (pending.expiresAt().isBefore(Instant.now())) {
            throw new IllegalArgumentException("state 已过期");
        }
        return pending;
    }

    private void cleanupExpired() {
        final Instant now = Instant.now();
        pendingByState.entrySet().removeIf(e -> e.getValue().expiresAt().isBefore(now));
    }
}
