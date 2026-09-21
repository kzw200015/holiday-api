package io.github.kzw200015.myapi.eh

import java.util.concurrent.ConcurrentHashMap

/** 只替换 SQL 执行边界的内存版 Mapper，保留真实的凭据序列化、缓存与上游校验流程。 */
open class InMemoryCredentials : CredentialMapper {
    val rows = ConcurrentHashMap<Long, CredentialRow>()

    /** 设了就让写入失败，模拟数据库故障。 */
    @Volatile
    var writeFailure: RuntimeException? = null

    override fun find(userId: Long): CredentialRow? = rows[userId]

    override fun upsert(userId: Long, memberId: String, cookie: String, hasExAccess: Boolean) {
        writeFailure?.let { throw it }
        rows[userId] = CredentialRow(memberId, cookie, hasExAccess)
    }

    override fun delete(userId: Long) {
        writeFailure?.let { throw it }
        rows.remove(userId)
    }
}

class NoProgress : ReadingProgressMapper {
    override fun findPage(userId: Long, gid: Long): Int? = null

    override fun upsert(userId: Long, gid: Long, token: String, page: Int) = Unit

    override fun list(userId: Long, before: HistoryCursor?, limit: Int): List<ProgressRow> = emptyList()

    override fun delete(userId: Long, gid: Long) = Unit

    override fun clear(userId: Long) = Unit
}
