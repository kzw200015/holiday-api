package io.github.kzw200015.myapi

import io.github.kzw200015.myapi.eh.FakeResponse
import io.github.kzw200015.myapi.eh.FakeUpstream
import io.github.kzw200015.myapi.eh.page
import io.github.kzw200015.myapi.eh.testJson
import io.github.kzw200015.myapi.eh.upstream.EhClient
import io.github.kzw200015.myapi.holiday.HolidayRemote
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.test.context.bean.override.convention.TestBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders
import org.springframework.web.client.RestClient
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping

/**
 * 用真实的整套应用跑一遍对外契约，只把三处外部依赖换掉：数据库换成 Testcontainers 起的 PostgreSQL（启动时建表），
 * e 站换成内存里的假响应，节假日数据源换成固定数据。
 */
@SpringBootTest(
    properties = [
        "myapi.secret-key=test-secret",
        "myapi.auth.allow-registration=true",
        "spring.sql.init.mode=always",
    ],
)
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration::class)
class ApiTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var mappings: RequestMappingHandlerMapping

    @TestBean
    private lateinit var holidayRemote: HolidayRemote

    @TestBean
    private lateinit var ehClient: EhClient

    @Test
    fun `公开接口的响应契约`() {
        // 节假日有外部调用方，响应逐字不能变；2026-01-04 是调休上班的周日
        assertJson("""{"code":200,"data":false,"msg":"OK"}""", 200, get("/api/holiday/is-holiday?date=2026-01-04"))
        assertJson("""{"code":200,"data":true,"msg":"OK"}""", 200, get("/api/holiday/is-holiday?date=2026-01-10"))
        assertJson(
            """{"code":200,"data":{"date":"2026-01-01","isOffDay":true,"name":"元旦"},"msg":"OK"}""",
            200,
            get("/api/holiday/detail?date=2026-01-01"),
        )
        assertJson("""{"code":400,"data":null,"msg":"日期格式错误，应为 YYYY-MM-DD"}""", 400, get("/api/holiday/is-holiday?date=invalid"))

        // 未登录问「我是谁」是 data 为 null 的 200，不是 401
        assertJson("""{"code":200,"data":null,"msg":"OK"}""", 200, get("/api/auth/me"))
        assertJson("""{"code":200,"data":{"allowRegistration":true},"msg":"OK"}""", 200, get("/api/auth/options"))
    }

    @Test
    fun `统一的失败响应`() {
        // 鉴权在解请求体之前：不带请求体也是 401
        assertJson("""{"code":401,"data":null,"msg":"请先登录"}""", 401, send(HttpMethod.POST, "/api/eh/galleries/search"))

        // 未匹配的 /api 路径回 JSON 404
        for (response in listOf(get("/api/unknown"), get("/api"))) {
            assertJson("""{"code":404,"data":null,"msg":"Not Found"}""", 404, response)
        }
        val token = token()
        // 方法不匹配回 405，Allow 头照 Spring 的默认带上
        val wrongMethod = get("/api/eh/progress", token)
        assertJson("""{"code":405,"data":null,"msg":"Method Not Allowed"}""", 405, wrongMethod)
        assertEquals("POST", wrongMethod.getHeader(HttpHeaders.ALLOW))
        assertJson("""{"code":400,"data":null,"msg":"请求体格式错误"}""", 400, send(HttpMethod.PUT, "/api/eh/preferences", token, "{"))
        // 路径参数连数字都不是，同样回统一结构
        for (gid in listOf("abc", "1.5", "9223372036854775808")) {
            assertJson("""{"code":400,"data":null,"msg":"请求参数格式错误"}""", 400, send(HttpMethod.DELETE, "/api/eh/history/$gid", token))
        }
    }

    @Test
    fun `注册即登录，令牌认得出本人`() {
        val body = """{"username":"register-user","password":"这个密码足够长了"}"""
        val registered = testJson.readTree(send(HttpMethod.POST, "/api/auth/register", body = body).contentAsString())
        assertEquals("register-user", registered.path("data").path("user").path("username").asString())
        assertJson(
            """{"code":400,"data":null,"msg":"用户名已被占用"}""",
            400,
            send(HttpMethod.POST, "/api/auth/register", body = body),
        )

        val login = testJson.readTree(send(HttpMethod.POST, "/api/auth/login", body = body).contentAsString())
        val token = login.path("data").path("token").asString()
        val me = testJson.readTree(get("/api/auth/me", token).contentAsString())
        assertEquals("register-user", me.path("data").path("username").asString())

        // 用户不存在与密码不对回同一句话
        val wrongPassword = """{"username":"register-user","password":"这个密码不是那个密码"}"""
        val unknownUser = """{"username":"nobody","password":"这个密码足够长了"}"""
        for (wrong in listOf(wrongPassword, unknownUser)) {
            assertJson("""{"code":400,"data":null,"msg":"用户名或密码错误"}""", 400, send(HttpMethod.POST, "/api/auth/login", body = wrong))
        }
    }

    /**
     * 签名地址的闭环：详情接口签发的地址，图片接口必须认得出来。地址在「签发」和「校验」两处各拼一次，
     * 两边哪天不一致，表现是所有图片突然打不开，而各自的单元测试都是绿的。
     */
    @Test
    fun `详情签发的图片地址不带令牌也打得开，改 uid 冒充别人不行`() {
        val token = token()
        val detail = testJson.readTree(get("/api/eh/galleries/2231376/a7584a5932", token).contentAsString()).path("data")
        val template = detail.path("imageUrlTemplate").asString()
        assertTrue("{page}" in template, template)

        // 前端只做这一件事：把 {page} 换成页码。不带 Authorization，走的就是 <img> 的形态
        val image = get(template.replace("{page}", "3"))
        assertEquals(200, image.status, image.contentAsString())
        assertEquals("image/webp", image.contentType)
        assertEquals(200, get(detail.path("gallery").path("thumbnail").asString()).status)

        // 签名覆盖了 uid：403 而不是 502，签名不对是本站自己的判断
        val forged = get(template.replace("{page}", "3").replace(Regex("uid=\\d+"), "uid=999999"))
        assertEquals(403, forged.status)
        assertTrue("签名不正确或已过期" in forged.contentAsString())
    }

    @Test
    fun `响应体的 JSON 形状`() {
        val token = token()
        val gallery = testJson.readTree(get("/api/eh/galleries/2231376/a7584a5932", token).contentAsString()).path("data").path("gallery")
        // 详情在卡片基础上多出的字段与卡片字段平铺在一起
        assertEquals(emptyList(), listOf("gid", "token", "title", "postedAt", "fileSize", "expunged").filterNot { gallery.has(it) })
        assertEquals("2022-05-28T01:53:30Z", gallery.path("postedAt").asString())
        assertEquals(4.68, gallery.path("rating").asDouble())

        assertEquals(
            """{"code":200,"data":[{"id":0,"author":"Pokom","postedAt":"2022-05-28T01:53:00Z","isUploader":true,"score":"",""" +
                """"segments":[{"type":"text","text":"第一行"},{"type":"break"},""" +
                """{"type":"link","text":"链接","href":"https://example.com/"}]}],"msg":"OK"}""",
            get("/api/eh/galleries/2231376/a7584a5932/comments", token).contentAsString(),
        )
    }

    /**
     * 鉴权边界按整张路由表扫，每条都不带令牌实际请求一次：不回 401 的恰好是这几条。逐条列路径的话，新加的接口没人记得补进来；
     * 反过来，图片接口要是被误改成要登录，<img> 就全打不开了。看的是响应而不是注解，拦截器的规则怎么改都照样锁得住。
     */
    @Test
    fun `公开接口恰好是这几条，其余不带令牌一律 401`() {
        val public = setOf(
            "GET /api/holiday/is-holiday",
            "GET /api/holiday/detail",
            "GET /api/auth/options",
            "POST /api/auth/register",
            "POST /api/auth/login",
            "GET /api/auth/me",
            "GET /api/eh/galleries/{gid}/{token}/pages/{page}/image",
            "GET /api/eh/thumbnail",
        )
        val routes = mappings.handlerMethods.keys.flatMap { info ->
            info.methodsCondition.methods.flatMap { method -> info.patternValues.filter { it.startsWith("/api/") }.map { "$method $it" } }
        }
        val open = routes.filter { route ->
            val (method, pattern) = route.split(' ')
            send(HttpMethod.valueOf(method), pattern.replace(Regex("\\{[^}]+}"), "1")).status != 401
        }
        assertEquals(public, open.toSet())
        assertTrue(routes.size - open.size > 10, "只扫到 ${routes.size - open.size} 条要登录的路由")
    }

    private fun token(): String {
        val body = """{"username":"user-${System.nanoTime()}","password":"这个密码足够长了"}"""
        return testJson.readTree(send(HttpMethod.POST, "/api/auth/register", body = body).contentAsString())
            .path("data").path("token").asString()
    }

    private fun get(url: String, token: String? = null) = send(HttpMethod.GET, url, token)

    private fun send(method: HttpMethod, url: String, token: String? = null, body: String? = null): MockHttpServletResponse {
        val request = MockMvcRequestBuilders.request(method, url)
        token?.let { request.header(HttpHeaders.AUTHORIZATION, "Bearer $it") }
        body?.let { request.contentType(MediaType.APPLICATION_JSON).content(it) }
        return mvc.perform(request).andReturn().response
    }

    private fun MockHttpServletResponse.contentAsString() = getContentAsString(Charsets.UTF_8)

    private fun assertJson(expected: String, status: Int, response: MockHttpServletResponse) {
        assertEquals(status to expected, response.status to response.contentAsString())
    }

    companion object {
        /** 数据源把 .json 按 text/plain 返回（带 charset=utf-8，照实写上）；只有 2026 年有数据，次年安排还没发布。 */
        @JvmStatic
        fun holidayRemote(): HolidayRemote {
            val upstream = FakeUpstream { request ->
                val days = if (request.uri.path == "/2026.json") HOLIDAYS_2026 else ""
                FakeResponse("""{"days":[$days]}""", contentType = "text/plain; charset=utf-8")
            }
            return HolidayRemote(RestClient.builder().requestFactory(upstream).build(), testJson)
        }

        /** 假的 e 站：gdata 回一条能过解析的元数据，两种页面各回一份最小样本，取图回一张图。 */
        @JvmStatic
        fun ehClient(): EhClient = FakeUpstream { request ->
            when {
                request.uri.host.startsWith("api.") -> FakeResponse(GDATA, contentType = "application/json")
                // 取图要先抓详情页分片拿每页令牌，再抓 /s/ 页面拿真正的图片地址
                request.uri.path.startsWith("/s/") ->
                    page("""<div id="i3"><a href="#"><img id="img" src="https://ehgt.org/p3.webp"></a></div>""")
                request.uri.path.startsWith("/g/") -> page(
                    """Showing 1 - 20 of 329 <a href="/s/bbbbbbbbbb/2231376-3"></a>""" +
                        """<div id="cdiv"><div class="c1"><div class="c3">Posted on 28 May 2022, 01:53 by: <a>Pokom</a></div>""" +
                        """<div class="c4">Uploader Comment</div><div class="c6" id="comment_0">第一行<br/>""" +
                        """<a href="https://example.com/">链接</a></div></div></div>""",
                )
                else -> FakeResponse("\u0001\u0002\u0003", contentType = "image/webp")
            }
        }.client()

        private const val HOLIDAYS_2026 = """{"name":"元旦","date":"2026-01-01","isOffDay":true},""" +
            """{"name":"元旦","date":"2026-01-04","isOffDay":false}"""

        private const val GDATA = """{"gmetadata":[{"gid":2231376,"token":"a7584a5932","title":"标题","title_jpn":"",
"category":"Artist CG","thumb":"https://ehgt.org/x.webp","uploader":"Pokom","posted":"1653702810",
"filecount":"329","filesize":"419547090","expunged":false,"rating":"4.68","torrentcount":"4",
"tags":["artist:gentsuki"]}]}"""
    }
}
