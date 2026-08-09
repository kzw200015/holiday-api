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

    /** 查询指定日期的记录，无记录返回 null。 */
    fun findByDate(date: String): HolidayDay? =
        holidayDayMapper.selectOne(
            KtQueryWrapper(HolidayDay::class.java).eq(HolidayDay::date, date),
            // 多行时取第一条而不抛异常
            false,
        )

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
        // 不用 BaseMapper.insert(Collection)：它内部另开 SqlSession，不会加入当前事务，
        // 先删后插就失去原子性。单年只有几十条，逐条插入的代价可以接受。
        days.forEach { holidayDayMapper.insert(it) }
    }
}
