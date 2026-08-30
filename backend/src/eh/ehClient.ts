import { logger } from "../logger"
import { ehFailure } from "./ehFailure"
import type { EhCookie, EhSite } from "./ehModels"
import { classifyResponse } from "./ehParser"
import type { EhRateLimiter } from "./ehRateLimiter"

/** 前站与里站的页面地址。 */
const PAGE_HOSTS: Record<EhSite, string> = {
  e: "https://e-hentai.org",
  ex: "https://exhentai.org",
}

/**
 * JSON API 的地址。
 *
 * 前站这个免登录就能用，返回的封面也落在 ehgt.org 上、不需要 Cookie，
 * 所以取元数据一律走它；只有里站独占的图集才需要退到 s.exhentai.org 并带上 Cookie。
 */
const API_HOSTS: Record<EhSite, string> = {
  e: "https://api.e-hentai.org/api.php",
  ex: "https://s.exhentai.org/api.php",
}

/** 检查账号在前站是否登录成功：未登录时这个页面会 302 走。 */
const HOME_URL = "https://e-hentai.org/home.php"

/** 图片能来自的主机。这是图片代理唯一的 SSRF 防线，不要放宽。 */
const IMAGE_HOSTS = new Set(["ehgt.org"])

/** H@H 节点的域名后缀。前面那个点不能省，否则 `evilhath.network` 也会被放行。 */
const HATH_SUFFIX = ".hath.network"

export interface EhRequestContext {
  /** 只用于限速时的公平调度。 */
  userId: number
  /** 用户绑定的 Cookie，没绑就是 null，此时匿名访问前站。 */
  credential: EhCookie | null
  site: EhSite
}

export type EhClient = ReturnType<typeof createEhClient>

/**
 * 所有对 e 站的 HTTP 调用都从这里出去：拼地址、带 Cookie、排队限速、超时，
 * 以及把「HTTP 200 但不是你要的东西」翻译成明确的失败。
 */
export function createEhClient({
  rateLimiter,
  userAgent,
  requestTimeoutMs,
}: {
  rateLimiter: EhRateLimiter
  userAgent: string
  requestTimeoutMs: number
}) {
  return {
    /** 取一个页面的 HTML。pathAndQuery 要以 / 开头。 */
    async fetchPage(ctx: EhRequestContext, pathAndQuery: string): Promise<string> {
      const url = `${PAGE_HOSTS[ctx.site]}${pathAndQuery}`
      return rateLimiter.run("html", ctx.userId, async () => {
        // 排查「一次操作到底打了几个上游请求」时全靠这条，默认级别下不输出
        logger.debug({ lane: "html", url }, "请求 e 站")
        const response = await request(url, { credential: ctx.credential })
        const body = await response.text()
        assertUsable({ status: response.status, body, url })
        return body
      })
    },

    /** 调 JSON API（gdata / showpage）。 */
    async callApi(ctx: EhRequestContext, body: unknown): Promise<unknown> {
      const url = API_HOSTS[ctx.site]
      return rateLimiter.run("api", ctx.userId, async () => {
        logger.debug({ lane: "api", url, method: (body as { method?: string })?.method }, "请求 e 站")
        const response = await request(url, {
          // 前站 API 免登录，不带 Cookie 也就不会把用户身份漏给它
          credential: ctx.site === "ex" ? ctx.credential : null,
          method: "POST",
          body: JSON.stringify(body),
        })
        const text = await response.text()
        assertUsable({ status: response.status, body: text, url })
        try {
          return JSON.parse(text) as unknown
        } catch (cause) {
          throw ehFailure("unavailable", "e 站接口返回的不是 JSON", { cause })
        }
      })
    },

    /**
     * 取一张图，返回上游响应本身以便流式转发，不把整张图读进内存。
     * 主机白名单在这里再校一遍：这个方法是唯一会去拉任意地址的地方。
     */
    async openImage(userId: number, url: string): Promise<Response> {
      if (!isAllowedImageUrl(url)) {
        logger.warn({ url }, "图片地址不在白名单内，已拒绝")
        throw ehFailure("unavailable", "图片地址不在允许的范围内")
      }
      return rateLimiter.run("image", userId, async () => {
        logger.debug({ lane: "image", url }, "请求 e 站")
        // 图床不认 e 站的 Cookie，把凭据发给第三方主机没有必要；
        // request 里的 redirect: "manual" 在这里还多挡一层——白名单主机若被诱导 302 到内网，
        // 跟随重定向就等于绕过了白名单
        const response = await request(url, { credential: null, withCookie: false })
        if (response.status === 509) {
          rateLimiter.tripBreaker()
          throw ehFailure("quotaExceeded", "e 站图片配额已用尽，等额度恢复后再看")
        }
        return response
      })
    },

    /**
     * 验证一组 Cookie 是否可用，顺便看看有没有里站权限。
     * 校验放在保存之前做，免得把一组用不了的 Cookie 存进库再让人一脸茫然。
     */
    async verifyCredential(userId: number, credential: EhCookie): Promise<{ valid: boolean; hasExAccess: boolean }> {
      const valid = await rateLimiter.run("html", userId, async () => {
        // 未登录时 home.php 会 302 到论坛登录页，登录成功才是 200
        const response = await request(HOME_URL, { credential })
        return response.status === 200
      })
      if (!valid) {
        return { valid: false, hasExAccess: false }
      }

      const hasExAccess = await rateLimiter.run("html", userId, async () => {
        const response = await request(`${PAGE_HOSTS.ex}/`, { credential })
        // 里站在账号没权限时回 200 加空 body（俗称 sad panda），不是 403
        return response.status === 200 && (await response.text()).trim().length > 0
      })
      return { valid: true, hasExAccess }
    },
  }

  /** 统一的 fetch：伪装 UA、带上固定 Cookie、超时、不跟随重定向。 */
  function request(
    url: string,
    {
      credential,
      method = "GET",
      body,
      withCookie = true,
    }: { credential: EhCookie | null; method?: string; body?: string; withCookie?: boolean },
  ): Promise<Response> {
    const headers: Record<string, string> = {
      // Bun 默认发 Bun/1.x，在一个明确禁止自动化抓取的站点上等于举手
      "User-Agent": userAgent,
    }
    if (withCookie) {
      headers.Cookie = buildCookieHeader(credential)
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json"
    }
    return fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(requestTimeoutMs),
      // 里站 Cookie 无效时会 302 回前站，跟随的话会拿到一个「看起来正常」的前站页面
      redirect: "manual",
    })
  }

  /** 把上游那些「200 但不是内容」的响应翻译成明确的失败，顺便在必要时拉闸。 */
  function assertUsable({ status, body, url }: { status: number; body: string; url: string }): void {
    const kind = classifyResponse({ status, body })

    if (kind === "quotaExceeded") {
      rateLimiter.tripBreaker()
      throw ehFailure("quotaExceeded", "e 站图片配额已用尽，等额度恢复后再试")
    }
    if (kind === "ipBanned") {
      rateLimiter.tripBreaker()
      logger.warn({ url }, "出口 IP 被 e 站临时封禁，已触发熔断")
      throw ehFailure("banned", "本机访问 e 站过于频繁已被临时限制，请过几分钟再试")
    }
    if (kind === "sadPanda") {
      throw ehFailure("sadPanda", "里站没有放行这次请求，检查一下绑定的 Cookie 是否仍然有效")
    }
    if (kind === "contentWarning") {
      // 请求里固定带了 nw=1，还撞上插页说明 e 站改了这套机制
      throw ehFailure("contentWarning", "e 站返回了内容警告页，nw cookie 可能已失效")
    }

    // 3xx 在这里也是异常：正常的页面请求不会重定向，会重定向说明身份没被认下来
    if (status >= 300) {
      throw ehFailure("unavailable", `e 站返回了 HTTP ${status}`)
    }
  }
}

/** 固定要带的 Cookie 加上用户自己的。 */
function buildCookieHeader(credential: EhCookie | null): string {
  // nw=1 跳过被标记图集的内容警告插页（不带的话那些页面会返回一张没有正文的插页）；
  // sl=dm_2 把搜索结果锁定成 Compact 模式，免得账号的显示设置把列表结构换掉
  const parts = ["nw=1", "sl=dm_2"]
  if (credential) {
    parts.push(`ipb_member_id=${credential.ipbMemberId}`, `ipb_pass_hash=${credential.ipbPassHash}`)
    if (credential.igneous) {
      parts.push(`igneous=${credential.igneous}`)
    }
  }
  return parts.join("; ")
}

/**
 * 图片主机白名单。
 * 只认精确的 ehgt.org 和 *.hath.network 两类，别的一律拒绝——
 * 用 includes 或者不带点的 endsWith 都会被 `ehgt.org.attacker.com` 之类绕过去。
 */
export function isAllowedImageUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return false
  }
  // H@H 节点用的是非标准端口（实测有 62121），所以端口不能限制死
  return IMAGE_HOSTS.has(url.hostname) || url.hostname.endsWith(HATH_SUFFIX)
}
