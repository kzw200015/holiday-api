package io.github.kzw200015.myapi.holiday

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.InitializingBean
import org.springframework.scheduling.annotation.SchedulingConfigurer
import org.springframework.scheduling.config.FixedDelayTask
import org.springframework.scheduling.config.ScheduledTaskRegistrar
import org.springframework.stereotype.Component

/**
 * 节假日数据什么时候拉。
 *
 * 启动时先拉当年和次年，拉不到就不启动：这一步在 Bean 初始化阶段完成，早于 Web 服务开始监听，
 * 免得接口带着空表一直回错误答案。之后按固定间隔重复拉，失败只记日志——库里已有可用数据，等下个周期重试即可。
 */
@Component
class HolidayRefresh(
    private val holidays: HolidayService,
    private val properties: HolidayProperties,
) : InitializingBean, SchedulingConfigurer {
    private val log = LoggerFactory.getLogger(javaClass)

    override fun afterPropertiesSet() = holidays.refreshUpcomingYears()

    override fun configureTasks(registrar: ScheduledTaskRegistrar) {
        val interval = properties.refreshInterval
        registrar.addFixedDelayTask(FixedDelayTask(::refreshQuietly, interval, interval))
    }

    private fun refreshQuietly() {
        try {
            holidays.refreshUpcomingYears()
        } catch (e: Exception) {
            log.error("定时刷新节假日数据失败", e)
        }
    }
}
