import { ref } from "vue"

import { galleryCategories } from "@/api/eh"

/* 只保存已应用的分类，面板草稿与当前关键词都不落盘。 */
export function useGalleryCategories(userId: number | undefined) {
  const key = `myapi.gallery-categories.${userId}`
  const selected = ref<string[]>([])
  function normalize(value: unknown) {
    return Array.isArray(value)
      ? galleryCategories.filter((category) => value.includes(category.value)).map((category) => category.value)
      : []
  }
  if (userId !== undefined) {
    try {
      selected.value = normalize(JSON.parse(localStorage.getItem(key) ?? "[]"))
    } catch { /* 损坏或不可读的存储不阻断浏览，退回不限分类。 */ }
  }
  function apply(categories: string[]) {
    selected.value = normalize(categories)
    if (userId === undefined) return
    try {
      localStorage.setItem(key, JSON.stringify(selected.value))
    } catch { /* 存储不可写时，当前页面仍可正常筛选。 */ }
  }
  return { selected, apply }
}
