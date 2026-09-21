package io.github.kzw200015.myapi.eh

import io.github.kzw200015.myapi.eh.upstream.EhAccess
import io.github.kzw200015.myapi.eh.upstream.EhCredential
import io.github.kzw200015.myapi.eh.upstream.Site
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

class CredentialServiceTest {
    private val old = EhCredential("100", "old-hash")
    private val new = EhCredential("200", "new-hash")

    /** 表站和里站都放行，绑定出来的凭据带里站权限。 */
    private val upstream = FakeUpstream { page("ok") }.client()

    /**
     * 修改凭据时正好有一次查库回填在途：回填读到的是旧凭据，修改却抢在它写回缓存之前完成。
     * 要是之后还拿到旧凭据，就是换绑、解绑不生效——直到缓存过期。
     */
    @Test
    fun `修改凭据不会被在途的旧回填盖回去`() {
        for ((initial, next) in listOf(old to null, old to new, null to new)) {
            val readStarted = CountDownLatch(1)
            val releaseRead = CountDownLatch(1)
            val mapper = object : InMemoryCredentials() {
                @Volatile
                var pauseNextRead = true

                override fun find(userId: Long): CredentialRow? {
                    val snapshot = super.find(userId)
                    if (pauseNextRead) {
                        pauseNextRead = false
                        readStarted.countDown()
                        releaseRead.await(5, TimeUnit.SECONDS)
                    }
                    return snapshot
                }
            }
            val service = CredentialService(mapper, upstream, testJson)
            initial?.let { mapper.upsert(1, it.ipbMemberId, testJson.writeValueAsString(it), true) }

            Executors.newVirtualThreadPerTaskExecutor().use { executor ->
                val read = executor.submit { service.status(1) }
                readStarted.await(5, TimeUnit.SECONDS)
                val change = executor.submit { service.change(next) }
                // 让修改先跑到完成或阻塞，再放行已经读到旧快照的回填
                Thread.sleep(100)
                releaseRead.countDown()
                read.get(5, TimeUnit.SECONDS)
                change.get(5, TimeUnit.SECONDS)
            }

            assertEquals(expectedAccess(next), service.access(1), "$initial → $next")
        }
    }

    @Test
    fun `写库失败时保留原来的凭据`() {
        for (next in listOf(null, new)) {
            val mapper = InMemoryCredentials()
            val service = CredentialService(mapper, upstream, testJson)
            service.bind(1, old)
            assertEquals(expectedAccess(old), service.access(1))

            val failure = IllegalStateException("数据库写入失败")
            mapper.writeFailure = failure
            val thrown = assertFailsWith<IllegalStateException> { service.change(next) }
            assertSame(failure, thrown)
            assertEquals(expectedAccess(old), service.access(1))

            mapper.writeFailure = null
            service.change(next)
            assertEquals(expectedAccess(next), service.access(1))
        }
    }

    @Test
    fun `有里站权限默认走里站，显式要表站时才降级`() {
        val service = CredentialService(InMemoryCredentials(), upstream, testJson)
        assertEquals(EhAccess.ANONYMOUS, service.access(1))

        service.bind(1, old)
        assertEquals(Site.EX, service.access(1).site)
        assertEquals(EhAccess(old, Site.E), service.access(1, Site.E))
        assertEquals(CredentialStatus(bound = true, memberId = "100", hasExAccess = true), service.status(1))
    }

    /** 换绑成 next；next 为 null 就是解绑。 */
    private fun CredentialService.change(next: EhCredential?) {
        if (next == null) unbind(1) else bind(1, next)
    }

    private fun expectedAccess(credential: EhCredential?) =
        credential?.let { EhAccess(it, Site.EX) } ?: EhAccess.ANONYMOUS
}
