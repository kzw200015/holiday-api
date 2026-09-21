package io.github.kzw200015.myapi.holiday

import java.time.Duration
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient
import tools.jackson.databind.json.JsonMapper

@ConfigurationProperties("myapi.holiday")
data class HolidayProperties(
    /** 定时刷新的间隔。数据源一年只更新几次（次年安排公布、临时调休），每天拉一次足够，也不会给它造成压力。 */
    val refreshInterval: Duration = Duration.ofHours(24),
)

@Configuration
class HolidayConfiguration {
    @Bean
    fun holidayRemote(json: JsonMapper) = HolidayRemote(
        RestClient.builder()
            .baseUrl("https://raw.githubusercontent.com/NateScarlet/holiday-cn/master")
            .requestFactory(JdkClientHttpRequestFactory().apply { setReadTimeout(Duration.ofSeconds(60)) })
            .build(),
        json,
    )
}
