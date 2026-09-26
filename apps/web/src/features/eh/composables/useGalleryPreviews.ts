import { useQuery } from "@pinia/colada"
import { computed, toValue, type MaybeRefOrGetter } from "vue"

import { fetchGalleryPreviews } from "@/features/eh/api"
import { ehKeys } from "@/features/eh/queries"
import type { GalleryPreview } from "@server/eh/gallery.service"

/** 详情页的一片：第几片、含哪几页。 */
interface PreviewSlice {
  index: number
  pages: number[]
}

/**
 * 预览图按 e 站详情页的分片取，每片几页由 e 站账号的设置决定：第 0 片最后一页的页码就是每片的页数，
 * 第 0 片到手之前（或者整本只有一片）把全部页码都算在第 0 片里。
 */
function previewSlices(fileCount: number, first: GalleryPreview[] | undefined): PreviewSlice[] {
  const lastInFirst = Math.max(0, ...(first ?? []).map((preview) => preview.page))
  const size = lastInFirst > 0 && lastInFirst < fileCount ? lastInFirst : fileCount
  const slices: PreviewSlice[] = []
  for (let from = 1; from <= fileCount; from += size) {
    const pages = Array.from({ length: Math.min(size, fileCount - from + 1) }, (_, offset) => from + offset)
    slices.push({ index: slices.length, pages })
  }
  return slices
}

/** 一本图集的预览图怎么分片。要先读到第 0 片才知道每片几页。 */
export function usePreviewSlices(
  gid: MaybeRefOrGetter<number>,
  token: MaybeRefOrGetter<string>,
  fileCount: MaybeRefOrGetter<number>,
) {
  const firstSlice = useQuery(() => previewQuery(toValue(gid), toValue(token), 0))
  return computed(() => previewSlices(toValue(fileCount), firstSlice.data.value))
}

/** 第 slice 片的预览图，按页码查。enabled 为 false 时不取：详情页滚到这一片附近才取。 */
export function useSlicePreviews(
  gid: MaybeRefOrGetter<number>,
  token: MaybeRefOrGetter<string>,
  slice: MaybeRefOrGetter<number>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  const query = useQuery(() => ({
    ...previewQuery(toValue(gid), toValue(token), toValue(slice)),
    enabled: toValue(enabled),
  }))
  return {
    previews: computed(() => new Map(query.data.value?.map((preview) => [preview.page, preview]))),
    errorMessage: computed(() => query.error.value?.message ?? ""),
    reload: () => void query.refresh(),
  }
}

/* 每片一条缓存，查询函数用的是这一片自己的参数 */
function previewQuery(gid: number, token: string, slice: number) {
  return {
    key: ehKeys.previews(gid, token, slice),
    query: ({ signal }: { signal: AbortSignal }) => fetchGalleryPreviews(gid, token, slice, signal),
  }
}
