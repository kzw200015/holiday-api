/**
 * 带过期与容量上限的进程内缓存。
 *
 * e 站这边要缓存的东西（图集元数据、每页令牌、showkey、解析出来的图片地址）都能重新拉，
 * 丢了顶多多打几个请求，所以不建缓存表——仓库没有迁移工具，每张表都得人工建，
 * 为可重建的数据加表不划算。
 */
export function createTtlCache<K, V>({ ttlMs, maxEntries }: { ttlMs: number; maxEntries: number }) {
  const entries = new Map<K, { value: V; expiresAt: number }>()

  return {
    get(key: K): V | undefined {
      const entry = entries.get(key)
      if (!entry) {
        return undefined
      }
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key)
        return undefined
      }
      // Map 按插入顺序迭代，取用时重新插一遍就把它挪到末尾，淘汰时从最前面开始即为 LRU
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },

    set(key: K, value: V): void {
      entries.delete(key)
      entries.set(key, { value, expiresAt: Date.now() + ttlMs })
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) {
          break
        }
        entries.delete(oldest)
      }
    },

    delete(key: K): void {
      entries.delete(key)
    },
  }
}
