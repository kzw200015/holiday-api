import { BadGatewayException, BadRequestException, HttpException, HttpStatus, NotFoundException } from "@nestjs/common"

/*
 * e 站那些可预期的失败，以及各自回给前端的状态码与文案。同一种失败可能从好几条路径冒出来（页面请求和图片请求
 * 都会撞上配额），文案只在这里写一份。
 *
 * 配额用尽、出口 IP 被临时封禁这类「过会儿再试」的回 429，和「服务器崩了」要能在前端分得出来；
 * 需要用户自己处理的（Cookie 不对）回 400；e 站没连上或返回了意料之外的东西回 502。
 */

function tooManyRequests(message: string) {
  return new HttpException(
    HttpException.createBody(message, "Too Many Requests", HttpStatus.TOO_MANY_REQUESTS),
    HttpStatus.TOO_MANY_REQUESTS,
  )
}

export const quotaExceeded = () => tooManyRequests("e 站图片配额已用尽，等额度恢复后再试")

export const banned = () => tooManyRequests("本机访问 e 站过于频繁已被临时限制，请过几分钟再试")

/** 里站返回了空页面：Cookie 无效、过期，或账号没有里站权限。这要用户自己去处理，不应混同于上游故障。 */
export const sadPanda = () => new BadRequestException("里站没有放行这次请求，检查一下绑定的 Cookie 是否仍然有效")

/** 撞上内容警告插页。请求里固定带了 nw=1，还撞上说明 e 站改了这套机制。 */
export const contentWarning = () => new BadGatewayException("e 站返回了内容警告页，nw cookie 可能已失效")

/** 用户贴进来的那组 Cookie 拿去实际请求过一次，上游没认。 */
export const credentialRejected = () =>
  new BadRequestException("这组 Cookie 用不了，确认一下是否复制完整、是否已经过期")

/** 图集在元数据接口里查不到：被删、转私有，或者 gid/token 对不上。 */
export const galleryMissing = () => new NotFoundException("这个图集取不到，可能已被删除或转为私有")

/** e 站用一段说明代替了页面：图集被删或转私有、令牌不对、页码越界。说明原文照转，它比我们猜的准。 */
export const upstreamNotice = (text: string) => new NotFoundException(`e 站提示：${text}`)

/** 上游返回了意料之外的东西，通常是版面改了。细节由抛出的地方记进日志。 */
export const unavailable = (message: string) => new BadGatewayException(message)

/** 图片流开始转发之后上游断了。 */
export const imageBroken = () => new BadGatewayException("图片传到一半，e 站那边断了")

/** 出网这一步本身失败了。原始错误只挂在 cause 上：「fetch failed」这种不该出现在前端弹窗里。 */
export const unreachable = (cause: unknown) => new BadGatewayException("请求 e 站失败，可能是网络不通或超时", { cause })

/**
 * 图床节点取图失败：回了错误状态码，或者根本连不上——节点下线多半是后一种。
 * 大图遇到它可以换一台节点重试一次；缩略图和重试后仍失败的，就按上游故障报告。
 */
export class ImageNodeFailure extends BadGatewayException {}
