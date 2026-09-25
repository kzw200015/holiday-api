/**
 * 图片代理唯一的 SSRF 防线，不要放宽：只认 https、不带用户信息、主机恰好是 ehgt.org 或以 .hath.network 结尾。
 *
 * 按 WHATWG URL 解析后看主机名：用 includes 或不带点的 endsWith 都会被 `ehgt.org.attacker.com`、`evilhath.network`
 * 之类绕过去；user@host 的形式能让粗心的主机名判断认错域。H@H 节点用的是非标准端口（实测有 62121），所以端口不限制。
 */
export function isAllowedImageUrl(raw: string): boolean {
  const url = URL.parse(raw)
  if (!url) {
    return false
  }
  const host = url.hostname
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    (host === "ehgt.org" || host.endsWith(".hath.network"))
  )
}

/**
 * 里站详情页上的预览图（/t/ 下一页一张、/m/ 下一片拼成一张）在 s.exhentai.org 上，不带里站 Cookie 取不到；
 * 同一路径在 ehgt.org 上照样有（按内容哈希存放），所以改到那里取，白名单不必放宽，取图也照旧不带 Cookie。
 * 别的地址原样交回，由白名单把关。
 */
export function onPublicThumbnailHost(raw: string): string {
  const url = URL.parse(raw)
  if (url?.protocol !== "https:" || url.hostname !== "s.exhentai.org" || !/^\/[tm]\//.test(url.pathname)) {
    return raw
  }
  return `https://ehgt.org${url.pathname}${url.search}`
}
