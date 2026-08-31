/**
 * 带过期与容量上限的进程内缓存。
 *
 * e 站这边要缓存的东西（图集元数据、每页令牌、showkey、解析出来的图片地址）都能重新拉，
 * 丢了顶多多打几个请求，所以不建缓存表——仓库没有迁移工具，每张表都得人工建，
 * 为可重建的数据加表不划算。
 */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>()
  private readonly ttlMs: number
  private readonly maxEntries: number

  constructor({ ttlMs, maxEntries }: { ttlMs: number; maxEntries: number }) {
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) {
      return undefined
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    // Map 按插入顺序迭代，取用时重新插一遍就把它挪到末尾，淘汰时从最前面开始即为 LRU
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
    // Map 允许边遍历边删，键按插入顺序出来，最前面的就是最久没被取用的那个
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) {
        break
      }
      this.entries.delete(oldest)
    }
  }

  delete(key: K): void {
    this.entries.delete(key)
  }
}
