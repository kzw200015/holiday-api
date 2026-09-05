import { galleryCategories } from "@/api/eh"
import { usePersistedValue } from "@/composables/usePersistedValue"

/* 只认已登记的分类并按登记顺序去重；面板草稿与当前关键词都不落盘。 */
function normalize(raw: unknown): string[] {
  return Array.isArray(raw)
    ? galleryCategories.filter((category) => raw.includes(category.value)).map((category) => category.value)
    : []
}

export function useGalleryCategories(userId: number | undefined) {
  const { value: selected, set: apply } = usePersistedValue("gallery-categories", userId, normalize)
  return { selected, apply }
}
