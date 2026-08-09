package io.github.kzw200015.myapi.holiday

import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.time.LocalDate

/**
 * 路由与统一响应结构的回归测试，不依赖数据库与远程数据源。
 */
@WebMvcTest(HolidayController::class)
class HolidayControllerTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @MockitoBean
    private lateinit var holidayService: HolidayService

    @Test
    fun `日期非法时返回 400`() {
        // 2024-02-31 是不存在的日期，同样应被拒绝
        for (date in listOf("2024-02-31", "abc")) {
            mockMvc.get("/api/holiday/is-holiday") { param("date", date) }
                .andExpect {
                    status { isBadRequest() }
                    content { string("""{"code":400,"data":null,"msg":"日期格式错误，应为 YYYY-MM-DD"}""") }
                }
        }
    }

    @Test
    fun `未匹配的 api 路径返回统一 404`() {
        for (path in listOf("/api/unknown", "/api")) {
            mockMvc.get(path)
                .andExpect {
                    status { isNotFound() }
                    content { string("""{"code":404,"data":null,"msg":"Not Found"}""") }
                }
        }
    }

    @Test
    fun `date 省略或为空串时取当天`() {
        val today = LocalDate.now()
        given(holidayService.query(today))
            .willReturn(HolidayQueryResult(date = today.toString(), isOffDay = false, name = ""))

        mockMvc.get("/api/holiday/is-holiday")
            .andExpect {
                status { isOk() }
                content { string("""{"code":200,"data":false,"msg":"OK"}""") }
            }
        mockMvc.get("/api/holiday/is-holiday") { param("date", "") }
            .andExpect {
                status { isOk() }
                content { string("""{"code":200,"data":false,"msg":"OK"}""") }
            }
    }

    @Test
    fun `is-holiday 只返回布尔值`() {
        given(holidayService.query(LocalDate.of(2026, 1, 1)))
            .willReturn(HolidayQueryResult(date = "2026-01-01", isOffDay = true, name = "元旦"))

        mockMvc.get("/api/holiday/is-holiday") { param("date", "2026-01-01") }
            .andExpect {
                status { isOk() }
                content { string("""{"code":200,"data":true,"msg":"OK"}""") }
            }
    }

    @Test
    fun `detail 返回日期、是否休息与名称`() {
        given(holidayService.query(LocalDate.of(2026, 1, 1)))
            .willReturn(HolidayQueryResult(date = "2026-01-01", isOffDay = true, name = "元旦"))

        mockMvc.get("/api/holiday/detail") { param("date", "2026-01-01") }
            .andExpect {
                status { isOk() }
                content {
                    string("""{"code":200,"data":{"date":"2026-01-01","isOffDay":true,"name":"元旦"},"msg":"OK"}""")
                }
            }
    }
}
