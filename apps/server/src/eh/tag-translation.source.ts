import { BadGatewayException, Inject, Injectable, Logger } from "@nestjs/common"
import { z } from "zod"

import { OUTBOUND, type Outbound } from "@/outbound/outbound.module"

/*
 * 取 release 分支上的镜像而不是 Release 资产：releases/latest/download 要经两次重定向，出网不跟随；
 * 仓库也只留最近三个 Release，写死某个版本的地址过几天就没了。
 */
const DATABASE_URL = "https://raw.githubusercontent.com/EhTagTranslation/Database/release/db.text.json"

/* text 版的 name 是去掉图片与链接后的纯文本，简介与链接这次不用，不收 */
const payloadSchema = z.object({
  head: z.object({ sha: z.string().min(1) }),
  data: z.array(
    z.object({
      namespace: z.string().min(1),
      data: z.record(z.string(), z.object({ name: z.string() })),
    }),
  ),
})

/** 译名表的一版：上游的提交 sha，外加每一条译名。 */
export interface TagTranslationRelease {
  sha: string
  entries: { namespace: string; raw: string; name: string }[]
}

const logger = new Logger("TagTranslationSource")

/** 拉不到或拉到的不对：原因只进日志，前端只看到一句中文。 */
function unavailable(message: string, detail: unknown) {
  logger.warn(`${message} ${String(detail instanceof Error ? (detail.cause ?? detail) : detail)}`)
  return new BadGatewayException(message, { cause: detail })
}

/** 标签译名的数据源：GitHub 上 EhTagTranslation 社区维护的数据库，整库一个 JSON 文件。 */
@Injectable()
export class TagTranslationSource {
  constructor(@Inject(OUTBOUND) private readonly outbound: Outbound) {}

  /** 拉取整库并校验格式，免得脏数据入库。一条译名都没有也算拉坏了：整表替换会把已有的译名清空。 */
  async fetchRelease(): Promise<TagTranslationRelease> {
    let payload: unknown
    try {
      const response = await this.outbound(DATABASE_URL)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      /* raw.githubusercontent 把 .json 按 text/plain 返回，json() 不看 Content-Type，照样能解 */
      payload = await response.json()
    } catch (error) {
      throw unavailable("拉取标签译名失败，可能是连不上 GitHub", error)
    }
    const parsed = payloadSchema.safeParse(payload)
    if (!parsed.success) {
      throw unavailable("标签译名数据的格式不对，上游可能改了格式", parsed.error.message)
    }
    /* 空的译名不收：收下了标签就显示成一个空徽章，不如回退到原文 */
    const entries = parsed.data.data.flatMap(({ namespace, data }) =>
      Object.entries(data).flatMap(([raw, { name }]) => (name ? [{ namespace, raw, name }] : [])),
    )
    if (entries.length === 0) {
      throw unavailable("标签译名数据是空的", `sha=${parsed.data.head.sha}`)
    }
    return { sha: parsed.data.head.sha, entries }
  }
}
