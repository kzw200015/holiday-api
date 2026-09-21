package io.github.kzw200015.myapi

import io.github.kzw200015.myapi.auth.UserMapper
import io.github.kzw200015.myapi.eh.*
import io.github.kzw200015.myapi.holiday.HolidayDay
import io.github.kzw200015.myapi.holiday.HolidayMapper
import org.mybatis.spring.SqlSessionTemplate
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Import
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import javax.sql.DataSource
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/**
 * XML 里的 SQL 编译期不做任何检查，所以每条都在真的 PostgreSQL 上跑一遍。
 * 每个用例在一个回滚的事务里执行，schema.sql 也在事务里建，互不影响。
 */
@MybatisTest
@Import(TestcontainersConfiguration::class, StringListTypeHandler::class)
@Sql("classpath:schema.sql")
class MapperTest {
    @Autowired
    private lateinit var users: UserMapper

    @Autowired
    private lateinit var credentials: CredentialMapper

    @Autowired
    private lateinit var preferences: PreferencesMapper

    @Autowired
    private lateinit var progress: ReadingProgressMapper

    @Autowired
    private lateinit var holidays: HolidayMapper

    @Autowired
    private lateinit var dataSource: DataSource

    @Autowired
    private lateinit var session: SqlSessionTemplate

    @Test
    fun `用户名唯一且大小写敏感`() {
        val alice = users.insert("Alice", "hash")
        assertEquals(alice, users.findById(alice.id))
        assertEquals(alice, users.findByUsername("Alice"))
        assertNull(users.findByUsername("alice"))
        users.insert("alice", "hash")
        assertFailsWith<DuplicateKeyException> { users.insert("Alice", "other") }
    }

    @Test
    fun `凭据按账号整条替换`() {
        val user = users.insert("credential", "hash").id
        assertNull(credentials.find(user))

        credentials.upsert(user, "100", """{"ipbMemberId":"100"}""", false)
        credentials.upsert(user, "200", """{"ipbMemberId":"200"}""", true)
        assertEquals(CredentialRow("200", """{"ipbMemberId":"200"}""", true), credentials.find(user))

        credentials.delete(user)
        assertNull(credentials.find(user))
    }

    @Test
    fun `偏好与搜索历史存在同一行，各自整份替换互不覆盖`() {
        val user = users.insert("preferences", "hash").id
        val other = users.insert("preferences-other", "hash").id
        assertNull(preferences.find(user))

        preferences.savePreferences(user, listOf("doujinshi", "manga"), 8)
        preferences.saveSearchHistory(user, listOf("词2", "词1"))
        assertEquals(PreferencesRow(listOf("doujinshi", "manga"), 8, listOf("词2", "词1")), preferences.find(user))

        // 清空就是提交一份空列表
        preferences.saveSearchHistory(user, emptyList())
        assertEquals(PreferencesRow(listOf("doujinshi", "manga"), 8, emptyList()), preferences.find(user))

        // 尚无这一行时先写搜索历史，其余的列落表上的默认值
        preferences.saveSearchHistory(other, listOf("首次搜索"))
        assertEquals(PreferencesRow(emptyList(), 5, listOf("首次搜索")), preferences.find(other))
    }

    @Test
    fun `阅读历史按最近阅读排序、游标翻页，按账号隔离`() {
        val user = users.insert("history", "hash").id
        val other = users.insert("history-other", "hash").id
        for (gid in 1L..27L) {
            progress.upsert(user, gid, "aaaaaaaaaa", gid.toInt())
        }
        progress.upsert(other, 27, "aaaaaaaaaa", 99)
        // 重复上报就覆盖
        progress.upsert(user, 5, "bbbbbbbbbb", 50)
        assertEquals(50, progress.findPage(user, 5))

        // 事务里 now() 不变，时间相同时靠 gid 保证顺序稳定
        val first = progress.list(user, null, 25)
        assertEquals((27L downTo 3L).toList(), first.map { it.gid })
        val second = progress.list(user, first.last().let { HistoryCursor(it.updatedAt, it.gid) }, 25)
        assertEquals(listOf(2L, 1L), second.map { it.gid })

        // 显式推进一条的时间，验证最近阅读排在 gid 前面
        JdbcTemplate(dataSource).update(
            "UPDATE eh_reading_progress SET updated_at = updated_at + interval '1 second' WHERE user_id = ? AND gid = 1",
            user,
        )
        // UPDATE 绕过了 MyBatis：同一事务里一模一样的查询会命中它的会话缓存，得先清掉
        session.clearCache()
        assertEquals(1L, progress.list(user, null, 25).first().gid)

        progress.delete(user, 27)
        assertNull(progress.findPage(user, 27))
        progress.clear(user)
        assertEquals(emptyList(), progress.list(user, null, 25))
        assertEquals(99, progress.findPage(other, 27))
    }

    @Test
    fun `节假日按年整批替换`() {
        holidays.insertAll(
            listOf(
                HolidayDay("2026-01-01", true, "元旦"),
                HolidayDay("2026-01-04", false, "元旦"),
                HolidayDay("2027-01-01", true, "元旦"),
            ),
        )
        assertEquals(HolidayDay("2026-01-04", false, "元旦"), holidays.findByDate("2026-01-04"))

        holidays.deleteYear(2026)
        assertNull(holidays.findByDate("2026-01-01"))
        assertEquals(HolidayDay("2027-01-01", true, "元旦"), holidays.findByDate("2027-01-01"))
    }
}
