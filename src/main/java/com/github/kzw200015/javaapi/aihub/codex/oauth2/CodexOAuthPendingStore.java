package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import org.redisson.api.RMapCache;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;

/**
 * state -> PKCE/code_verifier 的临时存储。
 */
@Component
public class CodexOAuthPendingStore {

    private static final String KEY_PENDING_BY_STATE = "java-api:aihub:codex:oauth:pending";

    private final RedissonClient redissonClient;

    public CodexOAuthPendingStore(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    public void put(String state, String codeVerifier, Instant expiresAt) {
        if (!StringUtils.hasText(state)) {
            throw new IllegalArgumentException("state 不能为空");
        }
        if (!StringUtils.hasText(codeVerifier)) {
            throw new IllegalArgumentException("codeVerifier 不能为空");
        }
        if (expiresAt == null) {
            throw new IllegalArgumentException("expiresAt 不能为空");
        }

        final long ttlSeconds = Duration.between(Instant.now(), expiresAt).toSeconds();
        if (ttlSeconds <= 0) {
            throw new IllegalArgumentException("expiresAt 无效");
        }

        pending().put(state, codeVerifier, ttlSeconds, TimeUnit.SECONDS);
    }

    public String consumeCodeVerifier(String state) {
        if (!StringUtils.hasText(state)) {
            throw new IllegalArgumentException("state 不能为空");
        }
        final String codeVerifier = pending().remove(state);
        if (!StringUtils.hasText(codeVerifier)) {
            throw new IllegalArgumentException("state 无效或已过期");
        }
        return codeVerifier;
    }

    private RMapCache<String, String> pending() {
        return redissonClient.getMapCache(KEY_PENDING_BY_STATE, StringCodec.INSTANCE);
    }
}
