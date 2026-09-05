import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "@lucide/vue"
import { defineComponent } from "vue"

import ErrorAlert from "@/components/ErrorAlert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useReader } from "@/composables/useReader"

/* 操作栏上的按钮共用一套外观 */
const chromeButton = {
  class: "pointer-events-auto text-white hover:bg-white/10 hover:text-white",
  size: "icon-sm",
  variant: "ghost",
} as const

/* 阅读视图逐页全屏展示，避免一次加载整本图集消耗上游图片额度。 */
export default defineComponent({
  name: "ReaderView",
  props: {
    gid: { type: Number, required: true },
    token: { type: String, required: true },
  },
  setup(props) {
    const {
      gallery, error, loading, page, totalPages, imageFailed,
      chromeVisible, currentSrc, goTo, exit, retryImage, onClick,
    } = useReader(props)

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
          <div class="relative flex flex-1 items-center justify-center overflow-hidden" {...{ onClick }}>
            {imageFailed.value ? (
              <div class="flex flex-col items-center gap-3 p-4 text-center">
                <p class="text-sm text-white/80">第 {page.value} 页没能加载出来。</p>
                <Button
                  size="sm"
                  variant="outline"
                  {...{ onClick: retryImage }}
                >
                  重试
                </Button>
              </div>
            ) : currentSrc.value ? (
              /* 地址空着时干脆不渲染 img：src="" 会让浏览器去请求当前页面地址 */
              <img
                alt={`第 ${page.value} 页`}
                class="max-h-svh max-w-full object-contain"
                key={currentSrc.value}
                src={currentSrc.value}
                {...{ onError: () => (imageFailed.value = true) }}
              />
            ) : null}

            {loading.value ? (
              <Skeleton class="absolute inset-x-1/4 inset-y-8 rounded-lg" />
            ) : null}
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
          <Button
            aria-label="退出阅读"
            {...chromeButton}
            {...{ onClick: exit }}
          >
            <XIcon />
          </Button>
          <p class="min-w-0 flex-1 truncate text-sm text-white/90">{gallery.value?.title ?? "加载中…"}</p>
        </div>

        <div
          inert={!chromeVisible.value}
          class={[
            "pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity",
            chromeVisible.value ? "opacity-100" : "opacity-0",
          ]}
        >
          <Button
            aria-label="上一页"
            {...chromeButton}
            {...{ disabled: !totalPages.value || page.value <= 1, onClick: () => goTo(page.value - 1) }}
          >
            <ChevronLeftIcon />
          </Button>

          <span class="text-sm text-white/90 tabular-nums">
            {page.value} / {totalPages.value || "…"}
          </span>

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
