import { Global, Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Agent, fetch } from "undici"

import type { Env } from "../config.js"

/** 出网请求里用得到的那几项。 */
export interface OutboundInit {
  method?: "GET" | "POST"
  headers?: Record<string, string>
  body?: string
}

/**
 * 出网：本进程访问外部网站（e 站、图床、节假日数据源）的唯一出口，形状就是 fetch。
 *
 * 做成可注入的 provider，是测试换掉外部网站的唯一接缝：测试里换成按请求回放内存响应、并记下每个请求的实现。
 * 响应一律不跟随重定向，调用方自己看 3xx：里站 Cookie 无效时会 302 回表站，跟随的话会拿到一个「看起来正常」的表站页面；
 * 图床若被诱导 302 到内网，跟随就等于绕过了图片主机白名单。
 */
export type Outbound = (url: string, init?: OutboundInit) => Promise<Response>

/** 注入出网用的令牌：`@Inject(OUTBOUND) outbound: Outbound`。 */
export const OUTBOUND = Symbol("OUTBOUND")

/* 图床节点是志愿者的机器，下线时多半连不上：连接超时比请求超时更早放弃，才好换一台节点重试。 */
const CONNECT_TIMEOUT = 10_000

/**
 * 真实的出网：undici 的 fetch 配一个连接池。
 *
 * 超时分两段：等响应头最多 timeout；之后按「多久没收到一个字节」算（bodyTimeout 是两次数据之间的间隔，不是总时长）。
 * 图片是边读边转发给浏览器的，按总时长算的话，弱网下一张大图传到一半就被掐断。
 */
export function createOutbound(userAgent: string, timeout: number): Outbound {
  const dispatcher = new Agent({
    connect: { timeout: Math.min(CONNECT_TIMEOUT, timeout) },
    headersTimeout: timeout,
    bodyTimeout: timeout,
  })
  return async (url, init = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: { "user-agent": userAgent, ...init.headers },
      redirect: "manual",
      dispatcher,
    })
    /* undici 的 Response 与全局的 Response 是同一套 Fetch 标准实现，只是类型声明各有一份 */
    return response as unknown as Response
  }
}

@Global()
@Module({
  providers: [
    {
      provide: OUTBOUND,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createOutbound(config.get("EH_USER_AGENT", { infer: true }), config.get("EH_REQUEST_TIMEOUT", { infer: true })),
    },
  ],
  exports: [OUTBOUND],
})
export class OutboundModule {}
