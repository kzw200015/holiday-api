package io.github.kzw200015.myapi.eh

import com.github.benmanes.caffeine.cache.Cache
import com.github.benmanes.caffeine.cache.Caffeine
import java.time.Duration
import java.util.concurrent.Executors

/** 加载都要等上游的网络，放在虚拟线程上跑，不占 Caffeine 默认的 ForkJoinPool 公共池。 */
private val loaders = Executors.newVirtualThreadPerTaskExecutor()

/**
 * 并发加载会合并的缓存：异步缓存的同步视图。同一个 key 同时只加载一次，后到的请求直接等还在加载的那一份，
 * 批量的 getAll 也一样；同步缓存的 getAll 做不到，各加载各的。加载期间也不占着同一个桶的锁，挡不住落在里面的其他 key。
 * 失败的加载不会留在缓存里。
 */
internal fun <K : Any, V : Any> coalescingCache(size: Long, ttl: Duration): Cache<K, V> =
    Caffeine.newBuilder()
        .maximumSize(size)
        .expireAfterWrite(ttl)
        .executor(loaders)
        .buildAsync<K, V>()
        .synchronous()
