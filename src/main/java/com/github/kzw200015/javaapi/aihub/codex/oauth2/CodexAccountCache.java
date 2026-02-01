package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Codex 可用账号缓存。
 */
@Component
public class CodexAccountCache {

    private static volatile List<CachedAccount> cached = List.of();

    private final AtomicInteger rr = new AtomicInteger();

    public record CachedAccount(String id, String accessToken, String chatgptAccountId) {
    }

    public void replaceAll(List<CachedAccount> accounts) {
        cached = accounts == null ? List.of() : List.copyOf(accounts);
    }

    public CachedAccount next() {
        final List<CachedAccount> snapshot = cached;
        if (snapshot.isEmpty()) {
            throw new IllegalStateException("没有可用的 OAuth 账号凭证，请等待定时刷新或重新添加账号");
        }
        final int idx = Math.floorMod(rr.getAndIncrement(), snapshot.size());
        return snapshot.get(idx);
    }

    public int size() {
        return cached.size();
    }
}
