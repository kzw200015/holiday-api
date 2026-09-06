import { defineComponent } from "vue"

import { galleryImageUrl } from "@/api/eh"
import { Button } from "@/components/ui/button"
import { useReaderStrip } from "@/composables/useReaderStrip"

/* 换图集由父级以 key 整体重建，这里只管一本图集内的滚动与加载。 */
export default defineComponent({
  name: "ReaderStrip",
  props: {
    page: { type: Number, required: true },
    total: { type: Number, required: true },
    template: { type: String, required: true },
    seeking: { type: Boolean, default: false },
  },
  emits: { pageChange: (_page: number) => true },
  setup(props, { emit }) {
    const strip = useReaderStrip(props, (page) => emit("pageChange", page))
    return () => (
      <div
        ref={strip.viewport}
        aria-label="横向阅读区域"
        class={[
          "no-scrollbar flex min-h-0 min-w-0 flex-1 touch-pan-x select-none overflow-x-auto overflow-y-hidden overscroll-x-contain",
          strip.dragging.value ? "cursor-grabbing" : "cursor-grab",
        ]}
        style={{ overflowAnchor: "none" }}
        onScroll={strip.onScroll}
        onWheel={strip.onWheel}
        onPointerdown={strip.onPointerDown}
        onPointermove={strip.onPointerMove}
        onPointerup={strip.onPointerEnd}
        onPointercancel={strip.onPointerEnd}
        onLostpointercapture={strip.onPointerEnd}
      >
        {strip.widths.value.map((width, index) => {
          const page = index + 1
          return (
            <div class="relative h-full shrink-0" style={{ width: `${width}px` }} key={page}>
              {strip.failed.value.has(page) ? (
                <div class="flex h-full flex-col items-center justify-center gap-3 p-4 text-white/80">
                  <p class="text-sm">第 {page} 页加载失败</p>
                  <Button variant="outline" class="cursor-pointer" {...{ onClick: () => strip.retry(page) }}>
                    重试
                  </Button>
                </div>
              ) : (
                <>
                  <div class="absolute inset-0 flex items-center justify-center text-sm text-white/40">
                    第 {page} 页
                  </div>
                  {strip.loaded.value.has(page) ? (
                    <img
                      class="relative block h-full w-full object-contain"
                      draggable={false}
                      alt={`第 ${page} 页`}
                      key={strip.nonces.value[page] ?? 0}
                      src={galleryImageUrl(props.template, page, { nonce: strip.nonces.value[page] })}
                      onLoad={(event) => void strip.imageLoaded(page, event.currentTarget as HTMLImageElement)}
                      onError={() => strip.failed.value.add(page)}
                    />
                  ) : null}
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  },
})
