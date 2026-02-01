package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import org.redisson.api.RBucket;
import org.redisson.api.RMap;
import org.redisson.api.RedissonClient;
import org.redisson.client.codec.StringCodec;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Codex 可用账号缓存（Redis）。
 */
@Component
public class CodexAccountCache {

    private static final String KEY_ACCOUNTS_BY_ID = "java-api:aihub:codex:accounts:by-id";

    private static final String KEY_STICKY_SESSION = "java-api:aihub:codex:sticky-session";

    /**
     * 粘性会话 TTL：避免 session_id 长期占用缓存。
     */
    private static final long STICKY_TTL_SECONDS = 6 * 60 * 60;

    private final RedissonClient redissonClient;
    private final JsonMapper jsonMapper;

    public record CachedAccount(String id, String accessToken, String chatgptAccountId) {
    }

    public CodexAccountCache(RedissonClient redissonClient, JsonMapper jsonMapper) {
        this.redissonClient = redissonClient;
        this.jsonMapper = jsonMapper;
    }

    public void replaceAll(List<CachedAccount> accounts) {
        final List<CachedAccount> snapshot = accounts == null ? List.of() : accounts;

        final String snapshotId = newSnapshotId();
        final String tmpAccountsByIdKey = KEY_ACCOUNTS_BY_ID + ":tmp:" + snapshotId;

        try {
            final RMap<String, String> accountsById = redissonClient.getMap(tmpAccountsByIdKey, StringCodec.INSTANCE);
            accountsById.clear();
            for (CachedAccount account : snapshot) {
                accountsById.put(account.id(), jsonMapper.writeValueAsString(account));
            }

            redissonClient.getKeys().rename(tmpAccountsByIdKey, KEY_ACCOUNTS_BY_ID);
        } catch (Exception ex) {
            redissonClient.getKeys().delete(tmpAccountsByIdKey);
            throw new IllegalStateException("写入账号缓存失败", ex);
        }
    }

    /**
     * 按 sessionId 选择账号（粘性会话）。
     * <p>
     * 以 Redis Key `java-api:aihub:codex:sticky-session:{sessionId}` 保存已绑定的账号 id，并设置 TTL。
     * <p>
     * 约定：同一个 sessionId 在客户端侧不会并发调用，因此这里不做复杂的并发竞争处理；
     * 如果缓存中的账号 id 已失效（例如刷新缓存后账号被移除），则重新随机选择并覆盖写入。
     */
    public CachedAccount selectBySessionId(String sessionId) {
        if (!StringUtils.hasText(sessionId)) {
            return randomAccount();
        }

        final RBucket<String> sticky = stickySession(sessionId);

        final String existingAccountId = sticky.get();
        if (StringUtils.hasText(existingAccountId)) {
            final CachedAccount existing = findById(existingAccountId);
            if (existing != null) {
                return existing;
            }
        }

        final CachedAccount selected = randomAccount();
        sticky.set(selected.id(), Duration.ofSeconds(STICKY_TTL_SECONDS));
        return selected;
    }

    public CachedAccount next() {
        return randomAccount();
    }

    public int size() {
        return accountsById().size();
    }

    private RMap<String, String> accountsById() {
        return redissonClient.getMap(KEY_ACCOUNTS_BY_ID, StringCodec.INSTANCE);
    }

    private RBucket<String> stickySession(String sessionId) {
        return redissonClient.getBucket(KEY_STICKY_SESSION + ":" + sessionId, StringCodec.INSTANCE);
    }

    private CachedAccount randomAccount() {
        final Set<String> ids = accountsById().randomKeys(1);
        if (ids == null || ids.isEmpty()) {
            throw new IllegalStateException("没有可用的 OAuth 账号凭证，请等待定时刷新或重新添加账号");
        }

        final String id = ids.iterator().next();
        final CachedAccount account = findById(id);
        if (account == null) {
            throw new IllegalStateException("账号缓存不一致：id=" + id);
        }
        return account;
    }

    private CachedAccount findById(String id) {
        if (!StringUtils.hasText(id)) {
            return null;
        }

        final String json = accountsById().get(id);
        if (!StringUtils.hasText(json)) {
            return null;
        }
        try {
            return jsonMapper.readValue(json, CachedAccount.class);
        } catch (Exception ex) {
            throw new IllegalStateException("读取账号缓存失败", ex);
        }
    }

    private static String newSnapshotId() {
        final long now = System.currentTimeMillis();
        final int rand = ThreadLocalRandom.current().nextInt();
        return Long.toString(now, 36) + "-" + Integer.toUnsignedString(rand, 36);
    }
}
