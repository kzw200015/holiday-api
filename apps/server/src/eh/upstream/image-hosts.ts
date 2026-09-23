/**
 * 图片代理唯一的 SSRF 防线，不要放宽：只认 https、不带用户信息、主机恰好是 ehgt.org 或以 .hath.network 结尾。
 *
 * 按 WHATWG URL 解析后看主机名：用 includes 或不带点的 endsWith 都会被 `ehgt.org.attacker.com`、`evilhath.network`
 * 之类绕过去；user@host 的形式能让粗心的主机名判断认错域。H@H 节点用的是非标准端口（实测有 62121），所以端口不限制。
 */
export function isAllowedImageUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
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
