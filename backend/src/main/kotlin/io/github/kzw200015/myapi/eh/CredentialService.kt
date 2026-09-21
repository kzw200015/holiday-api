package io.github.kzw200015.myapi.eh

import com.github.benmanes.caffeine.cache.Cache
import com.github.benmanes.caffeine.cache.Caffeine
import io.github.kzw200015.myapi.eh.upstream.EhAccess
import io.github.kzw200015.myapi.eh.upstream.EhClient
import io.github.kzw200015.myapi.eh.upstream.EhCredential
import io.github.kzw200015.myapi.eh.upstream.Site
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.readValue
import java.time.Duration

/** 绑定状态，不含明文 Cookie。 */
data class CredentialStatus(
    val bound: Boolean,
    /** 未绑定时为空串。 */
    val memberId: String,
    val hasExAccess: Boolean,
) {
    companion object {
        val UNBOUND = CredentialStatus(bound = false, memberId = "", hasExAccess = false)
    }
}

/** 本站账号绑定的 e 站凭据，以及每次上游请求用哪个身份、走哪个站。 */
@Service
class CredentialService(
    private val credentials: CredentialMapper,
    private val client: EhClient,
    private val json: JsonMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * 每张图片都要用凭据，缓存住免得每次查库；绑定和解绑成功后作废。
     *
     * 同一账号的「查库回填」与「作废」之间有竞态：回填读到的是旧凭据，作废却抢在它写回之前完成，旧凭据就又回到缓存里。
     * Caffeine 的 get 对同一个 key 是原子的，作废会等在途的回填结束后再移除，这个窗口因此不存在。
     * 查库失败不进缓存：否则一次数据库抖动会把这个账号钉死到过期为止。
     */
    private val cache: Cache<Long, Binding> = Caffeine.newBuilder()
        .maximumSize(1000)
        .expireAfterWrite(Duration.ofMinutes(30))
        .build()

    fun status(userId: Long): CredentialStatus = load(userId).status

    /** 绑定前先拿这组 Cookie 实际请求一次，用不了直接回 400，免得把一组坏凭据存进库再让人一脸茫然。 */
    fun bind(userId: Long, credential: EhCredential): CredentialStatus {
        credential.validate()
        val hasExAccess = client.verifyCredential(credential)
        credentials.upsert(userId, credential.ipbMemberId, json.writeValueAsString(credential), hasExAccess)
        cache.invalidate(userId)
        log.info("已绑定 e 站凭据 userId={} hasExAccess={}", userId, hasExAccess)
        return CredentialStatus(bound = true, memberId = credential.ipbMemberId, hasExAccess = hasExAccess)
    }

    /** 解绑后退回匿名浏览表站，回一份解绑后的状态，跟绑定一样由服务端给出结果。 */
    fun unbind(userId: Long): CredentialStatus {
        credentials.delete(userId)
        cache.invalidate(userId)
        return CredentialStatus.UNBOUND
    }

    /** 一次上游请求的身份与站点：有里站权限就默认走里站（内容是表站的超集），调用方显式要表站时才降级。 */
    fun access(userId: Long, requested: Site? = null): EhAccess {
        val binding = load(userId)
        val credential = binding.credential ?: return EhAccess.ANONYMOUS
        val site = if (binding.status.hasExAccess && requested != Site.E) Site.EX else Site.E
        return EhAccess(credential, site)
    }

    private fun load(userId: Long): Binding = cache.get(userId) {
        credentials.find(it)?.let { row ->
            Binding(json.readValue<EhCredential>(row.cookie), CredentialStatus(true, row.memberId, row.hasExAccess))
        } ?: Binding(null, CredentialStatus.UNBOUND)
    }

    /** Caffeine 不收 null，没绑定也得缓存成一个值。 */
    private class Binding(val credential: EhCredential?, val status: CredentialStatus)
}
