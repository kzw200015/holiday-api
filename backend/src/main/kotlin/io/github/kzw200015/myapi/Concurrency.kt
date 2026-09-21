package io.github.kzw200015.myapi

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.runBlocking
import java.util.concurrent.Executors

/*
 * 请求内部的并发。请求本身跑在虚拟线程上、直写阻塞代码；只有少数几处要同时等两件互不依赖的事
 * （详情页的阅读进度与元数据、凭据的两路探测、节假日的两个年份），才经 concurrently 开协程。
 *
 * 子协程跑在虚拟线程承载的 dispatcher 上，而不是 Dispatchers.IO：后者默认只有 64 个平台线程，
 * 阻塞的 JDBC 与 HTTP 调用会把它们占满。
 *
 * ThreadLocal 不会跟进子协程：一个子协程里从头到尾开完、关完的事务没问题，但不能指望调用方的事务或
 * 日志 MDC 延续到子协程里。取消也是协作式的，阻塞中的调用不会被打断，只是结果不再被用上。
 */
private val virtualThreads = Executors.newVirtualThreadPerTaskExecutor().asCoroutineDispatcher()

/** 在当前线程上等 block 及其开出的子协程全部结束；任一个失败，其余的被取消，异常原样抛给调用方。 */
fun <T> concurrently(block: suspend CoroutineScope.() -> T): T = runBlocking(virtualThreads, block)
