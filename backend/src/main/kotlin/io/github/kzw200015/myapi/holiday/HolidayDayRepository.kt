package io.github.kzw200015.myapi.holiday

import com.baomidou.mybatisplus.extension.kotlin.KtQueryWrapper
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional

/**
 * holiday_days 表的数据访问：条件构造与「年份即 date 列前缀」这类存储约定都收在这一层，
 * 业务层只按领域语义调用。
 */
@Repository
class HolidayDayRepository(private val holidayDayMapper: HolidayDayMapper) {

    /**
     * 查询指定日期的记录，无记录返回 null。
     *
     * date 列有唯一索引（`holiday_days_date_key`），最多命中一行，所以用严格版 `selectOne`：
     * 真出现多行说明索引被人删了，抛 `TooManyResultsException` 比静默返回其中一行好。
     */
    fun findByDate(date: String): HolidayDay? =
        holidayDayMapper.selectOne(KtQueryWrapper(HolidayDay::class.java).eq(HolidayDay::date, date))

    /**
     * 以「先删后插」的方式替换指定年份的数据，整体在一个事务内完成。
     * 事务代理只对外部调用生效，因此本方法由 [HolidayService] 跨 Bean 调用。
     */
    @Transactional
    fun replaceYear(year: Int, days: List<HolidayDay>) {
        // 删除该年份的旧数据
        holidayDayMapper.delete(
            KtQueryWrapper(HolidayDay::class.java).likeRight(HolidayDay::date, "$year-")
        )
        // insert(Collection) 内部 openSession(ExecutorType.BATCH) 却仍在当前事务里：mybatis-spring
        // 装的是 SpringManagedTransactionFactory，它忽略 autoCommit、连接取自 DataSourceUtils，
        // 会话自己的 commit() 在连接已被事务接管时空转。所以先删后插是原子的，且走真 JDBC batch。
        // 前提是单数据源 + Spring 管事务；换手工 SqlSessionFactory 或多数据源要重新验证。
        holidayDayMapper.insert(days)
    }
}
