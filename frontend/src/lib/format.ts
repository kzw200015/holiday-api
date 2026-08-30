/* 展示用的格式化。这些逻辑在列表、详情、评论里都要用，集中放一处免得各写各的 */

const dateTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/* 后端给的都是 ISO 字符串（e 站那边是 UTC），这里按浏览器本地时区显示 */
export function formatDateTime(iso: string): string {
  if (!iso) {
    return ""
  }
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormat.format(date)
}

const SIZE_UNITS = ["B", "KB", "MB", "GB"]

export function formatFileSize(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${SIZE_UNITS[unit]}`
}

/* 标签形如 artist:gentsuki；没有冒号的归到空命名空间 */
export function splitTag(tag: string): { namespace: string; value: string } {
  const index = tag.indexOf(":")
  return index < 0 ? { namespace: "", value: tag } : { namespace: tag.slice(0, index), value: tag.slice(index + 1) }
}

/* 标签命名空间的中文名，没收录的就原样显示 */
const NAMESPACE_LABELS: Record<string, string> = {
  language: "语言",
  parody: "原作",
  character: "角色",
  group: "社团",
  artist: "作者",
  male: "男性",
  female: "女性",
  mixed: "混合",
  other: "其他",
  cosplayer: "扮演者",
  reclass: "重分类",
  temp: "临时",
}

export function formatNamespace(namespace: string): string {
  return NAMESPACE_LABELS[namespace] ?? namespace
}
