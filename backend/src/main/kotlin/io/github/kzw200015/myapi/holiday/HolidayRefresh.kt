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
 * 启动时先拉当年和次年：这一步在 Bean 初始化阶段完成，早于 Web 服务开始监听。拉不到时，库里已经有今年的安排就照常启动、
 * 只记日志——数据源在 GitHub 上，偶尔连不上，不该连登录、图库一起起不来；连今年的都没有才拒绝启动，
 * 免得接口带着空表一直按周末规则回错误答案。之后按固定间隔重复拉，失败只记日志，等下个周期重试即可。
 */
@Component
class HolidayRefresh(
    private val holidays: HolidayService,
    private val properties: HolidayProperties,
) : InitializingBean, SchedulingConfigurer {
    private val log = LoggerFactory.getLogger(javaClass)

    override fun afterPropertiesSet() {
        try {
            holidays.refreshUpcomingYears()
        } catch (e: Exception) {
            if (!holidays.hasCurrentYear()) {
                throw e
            }
            log.error("启动时刷新节假日数据失败，先用库里已有的数据", e)
        }
    }

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
