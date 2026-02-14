import dayjs from "dayjs"
import { ElMessage } from "element-plus"

export function formatDateTime(value: string) {
  return dayjs(value).format("YYYY-MM-DD HH:mm:ss")
}

export async function copyToClipboard(text: string) {
  if (text === "") {
    ElMessage.warning("没有可复制的内容")
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success("已复制")
  } catch {
    ElMessage.error("复制失败，请手动复制")
  }
}
