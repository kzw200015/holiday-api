import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "@lucide/vue"
import { defineComponent, ref } from "vue"

import ErrorAlert from "@/components/ErrorAlert"
import ReaderStrip from "@/components/gallery/ReaderStrip"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useReader } from "@/composables/useReader"

/* 操作栏上的按钮共用一套外观 */
const chromeButton = {
  class: "pointer-events-auto cursor-pointer text-white hover:bg-white/10 hover:text-white",
  size: "icon-sm",
  variant: "ghost",
} as const

/* 图片区连续横向滚动，底部导航始终可用，不跟随顶栏自动隐藏。 */
export default defineComponent({
  name: "ReaderView",
  props: {
    gid: { type: Number, required: true },
    token: { type: String, required: true },
    page: { type: Number, required: true },
  },
  setup(props) {
    const { gallery, error, loading, page, totalPages, imageUrlTemplate, chromeVisible, showChrome, goTo, exit } =
      useReader(props)
    const seeking = ref(false)

    return () => (
      <div class="fixed inset-0 flex flex-col bg-black">
        {error.value ? (
          <div class="flex flex-1 items-center justify-center p-4">
            <div class="max-w-md">
              <ErrorAlert message={error.value.message} title="打不开这个图集">
                <Button size="sm" variant="outline" {...{ onClick: exit }}>
                  返回
                </Button>
              </ErrorAlert>
            </div>
          </div>
        ) : (
          <div class="relative flex min-h-0 flex-1 overflow-hidden" onPointerdown={showChrome} onMousemove={showChrome}>
            {imageUrlTemplate.value && totalPages.value ? (
              <ReaderStrip
                key={`${props.gid}/${props.token}`}
                page={page.value}
                total={totalPages.value}
                template={imageUrlTemplate.value}
                seeking={seeking.value}
                onPageChange={goTo}
              />
            ) : null}

            {loading.value ? <Skeleton class="absolute inset-x-1/4 inset-y-8 rounded-lg" /> : null}
          </div>
        )}

        {/* 隐藏后用 inert 停止接收焦点和点击，图片区域才能继续翻页。 */}
        <div
          inert={!chromeVisible.value}
          class={[
            "pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 transition-opacity",
            chromeVisible.value ? "opacity-100" : "opacity-0",
          ]}
        >
          <Button aria-label="退出阅读" {...chromeButton} {...{ onClick: exit }}>
            <XIcon />
          </Button>
          <p class="min-w-0 flex-1 truncate text-sm text-white/90">{gallery.value?.title ?? "加载中…"}</p>
        </div>

        <div class="flex shrink-0 items-center gap-3 bg-zinc-950 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            aria-label="上一页"
            {...chromeButton}
            {...{ disabled: !totalPages.value || page.value <= 1, onClick: () => goTo(page.value - 1) }}
          >
            <ChevronLeftIcon />
          </Button>

          <span class="min-w-6 text-center text-sm text-white/90 tabular-nums">{page.value}</span>
          <input
            type="range"
            min={1}
            max={totalPages.value || 1}
            step={1}
            value={page.value}
            disabled={!totalPages.value}
            aria-label="阅读进度"
            aria-valuetext={`第 ${page.value} 页，共 ${totalPages.value} 页`}
            class="reader-progress h-8 min-w-0 flex-1 cursor-pointer"
            style={{
              "--reader-progress": `${totalPages.value > 1 ? ((page.value - 1) / (totalPages.value - 1)) * 100 : 0}%`,
            }}
            onPointerdown={(event) => {
              seeking.value = true
              ;(event.currentTarget as HTMLInputElement).setPointerCapture(event.pointerId)
            }}
            onPointerup={() => {
              seeking.value = false
            }}
            onPointercancel={() => {
              seeking.value = false
            }}
            onLostpointercapture={() => {
              seeking.value = false
            }}
            onInput={(event) => goTo(Number((event.currentTarget as HTMLInputElement).value))}
          />
          <span class="text-sm text-white/90 tabular-nums">{totalPages.value || "…"}</span>

          <Button
            aria-label="下一页"
            {...chromeButton}
            {...{
              disabled: !totalPages.value || page.value >= totalPages.value,
              onClick: () => goTo(page.value + 1),
            }}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    )
  },
})
