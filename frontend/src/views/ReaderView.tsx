import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon, XIcon } from "@lucide/vue"
import { computed, defineComponent, ref, watch } from "vue"
import { onBeforeRouteLeave } from "vue-router"

import ErrorAlert from "@/components/ErrorAlert"
import ReaderStrip from "@/components/gallery/ReaderStrip"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutoPage } from "@/composables/useAutoPage"
import { useReader } from "@/composables/useReader"
import { useAuthStore } from "@/stores/AuthStore"

/* 操作栏上的按钮共用一套外观 */
const chromeButton = {
  class: "pointer-events-auto cursor-pointer text-white hover:bg-white/10 hover:text-white",
  size: "icon-sm",
  variant: "ghost",
} as const

/* 上下操作栏覆盖在阅读区上并同步隐藏，不占用图片的可用高度。 */
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
    /* 进度条捕获指针期间保持操作栏可用，松手后重新开始隐藏计时。 */
    const controlsVisible = computed(() => chromeVisible.value || seeking.value)
    watch(seeking, showChrome)
    const dragging = ref(false)
    const identity = computed(() => `${props.gid}/${props.token}`)
    const autoPage = useAutoPage(
      { identity, page, total: totalPages, dragging: computed(() => seeking.value || dragging.value) },
      goTo,
      useAuthStore().user?.id,
    )
    onBeforeRouteLeave(autoPage.stop)
    watch(identity, () => {
      seeking.value = false
      dragging.value = false
    })

    return () => (
      <div
        class="fixed inset-0 flex flex-col bg-black"
        onPointerdown={showChrome}
        onMousemove={showChrome}
        onFocusin={showChrome}
      >
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
          <div class="relative flex min-h-0 flex-1 overflow-hidden">
            {imageUrlTemplate.value && totalPages.value ? (
              <ReaderStrip
                key={`${props.gid}/${props.token}`}
                page={page.value}
                total={totalPages.value}
                template={imageUrlTemplate.value}
                seeking={seeking.value}
                onPageChange={goTo}
                onDraggingChange={(value) => {
                  dragging.value = value
                }}
              />
            ) : null}

            {loading.value ? <Skeleton class="absolute inset-x-1/4 inset-y-8 rounded-lg" /> : null}
          </div>
        )}

        {/* 隐藏后用 inert 停止接收焦点和点击，图片区域才能继续翻页。 */}
        <div
          inert={!controlsVisible.value}
          class={[
            "pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 transition-opacity",
            controlsVisible.value ? "opacity-100" : "opacity-0",
          ]}
        >
          <Button aria-label="退出阅读" {...chromeButton} {...{ onClick: exit }}>
            <XIcon />
          </Button>
          <p class="min-w-0 flex-1 truncate text-sm text-white/90">{gallery.value?.title ?? "加载中…"}</p>
        </div>

        <div
          inert={!controlsVisible.value}
          class={[
            "absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity",
            controlsVisible.value ? "opacity-100" : "pointer-events-none opacity-0",
          ]}
        >
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

          <div class="flex items-center gap-1">
            <Button
              aria-label={autoPage.active.value ? "暂停自动翻页" : "开始自动翻页"}
              aria-pressed={autoPage.active.value}
              {...chromeButton}
              {...{ disabled: !autoPage.canStart.value, onClick: autoPage.toggle }}
            >
              {autoPage.active.value ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <select
              aria-label="自动翻页间隔"
              class="h-8 rounded border border-white/20 bg-zinc-950 px-1 text-sm text-white"
              value={autoPage.interval.value}
              onChange={(event) => autoPage.setInterval(Number((event.currentTarget as HTMLSelectElement).value))}
            >
              {Array.from({ length: 20 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1} 秒
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    )
  },
})
