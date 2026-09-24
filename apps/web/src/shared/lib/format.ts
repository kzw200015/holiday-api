/* 展示用的通用格式化，与具体业务无关。图集分类的中文说法见 features/eh/labels.ts */

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
