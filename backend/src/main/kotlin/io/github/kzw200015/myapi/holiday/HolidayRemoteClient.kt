package io.github.kzw200015.myapi.holiday

import org.springframework.http.MediaType
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import org.springframework.web.client.body

/**
 * 从远程数据源（holiday-cn 仓库）拉取节假日数据。
 * 超时由 application.yml 的 spring.http.clients 统一配置。
 */
@Component
class HolidayRemoteClient(restClientBuilder: RestClient.Builder) {
    private val restClient = restClientBuilder
        .baseUrl(REMOTE_BASE_URL)
        .configureMessageConverters { converters ->
            // 数据源把 .json 文件按 text/plain 返回，默认的 JSON 转换器只认 application/json，
            // 这里放宽本客户端可读的媒体类型
            converters.withJsonConverter(
                JacksonJsonHttpMessageConverter().apply {
                    setSupportedMediaTypes(listOf(MediaType.APPLICATION_JSON, MediaType.TEXT_PLAIN))
                }
            )
        }
        .build()

    /** 拉取指定年份的节假日数据。 */
    fun fetchYearDays(year: Int): List<HolidayDay> {
        val response = try {
            restClient.get()
                .uri("/{year}.json", year)
                .retrieve()
                .body<HolidayYearResponse>()
        } catch (ex: RestClientException) {
            throw IllegalStateException("拉取 $year 年节假日数据失败", ex)
        }
        // 校验远程响应结构
        return response?.days ?: throw IllegalStateException("$year 年节假日数据格式异常: 缺少 days 数组")
    }

    companion object {
        /** 节假日数据源的基础地址。 */
        private const val REMOTE_BASE_URL = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master"
    }
}
