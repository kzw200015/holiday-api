import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "@lucide/vue"
import { useDebounceFn, useEventListener, useTimeoutFn } from "@vueuse/core"
import { computed, defineComponent, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"

import { fetchGalleryDetail, galleryImageUrl, type GalleryDetail, saveProgress } from "@/api/eh"
import { errorText } from "@/api/httpClient"
import ErrorAlert from "@/components/ErrorAlert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

/*
 * 往后预取几页。
 *
 * 每张图都要后端跟 e 站换一次地址，而那条通道是限速的（约 4 次 / 5 秒，全站共用），
 * 而且每张都算在用户 e 站账号的每日图片额度里，所以预取要克制。
 */
const PRELOAD_AHEAD = 2

/* 操作栏静置多久自动隐藏 */
const CHROME_HIDE_MS = 2500

/* 进度上报压一压：连续翻页时只报最后停下的那一页 */
const PROGRESS_DEBOUNCE_MS = 1200

/* 翻页键与它对应的方向。剩下几个键各干各的，在 onKeydown 里单独判 */
const PAGE_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  PageDown: 1,
  " ": 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  PageUp: -1,
}

/* 操作栏上的按钮共用一套外观 */
const chromeButton = {
  class: "pointer-events-auto text-white hover:bg-white/10 hover:text-white",
  size: "icon-sm",
  variant: "ghost",
} as const

/*
 * 阅读视图：一次一页，全屏。
 *
 * 走顶层路由不套 AppLayout，所以没有侧边栏和顶栏。
 * 用翻页而不是连续纵向滚动，是因为图片高度事先不知道，
 * 连续滚动要么用占位高度猜、猜错就跳动，要么一次性加载全部、把取图额度耗光。
 */
export default defineComponent({
  name: "ReaderView",
  setup() {
    const route = useRoute()
    const router = useRouter()

    const gid = Number(route.params.gid)
    const token = String(route.params.token)

    const gallery = ref<GalleryDetail | null>(null)
    const errorMessage = ref("")
    const imageFailed = ref(false)
    /* 换一个值就能让 img 重新发一次请求 */
    const retryNonce = ref(0)
    const chromeVisible = ref(true)

    /*
     * 当前页码只有地址栏这一个来源。
     * 单独存一份 ref 再手工跟 router.replace 同步的话，浏览器前进后退和手改地址都会失效
     */
    const page = computed(() => Math.max(1, Number(route.params.page) || 1))
    const totalPages = computed(() => gallery.value?.fileCount ?? 0)

    /*
     * 正常情况下不带任何查询参数，这样才能和 preload 预取的地址完全一致、命中同一份浏览器缓存。
     * 只有重试时才挂上 nonce 去绕开缓存
     */
    const currentSrc = computed(() => galleryImageUrl(gid, token, page.value, { nonce: retryNonce.value }))

    const { start: scheduleHide } = useTimeoutFn(() => (chromeVisible.value = false), CHROME_HIDE_MS, {
      immediate: false,
    })

    function showChrome() {
      chromeVisible.value = true
      /* start 会把上一次的计时重新开始，不用自己 clearTimeout */
      scheduleHide()
    }

    function goTo(next: number) {
      const clamped = Math.min(Math.max(1, next), totalPages.value || next)
      if (clamped === page.value) {
        return
      }
      /* 地址栏跟着走，刷新或分享都能回到这一页；用 replace 免得把每页都堆进历史 */
      void router.replace({ name: "reader", params: { gid, token, page: clamped } })
    }

    /*
     * 预取后面几页：浏览器缓存住之后翻过去就是瞬开。
     * 记下预取过哪些页，否则 1→2→3 会把第 3、4 页各预取两遍，快速翻页时更明显。
     * 图片响应头是 immutable 的，同一页永远不需要重取，所以这个集合不用清
     */
    const preloaded = new Set<number>()

    function preload() {
      for (let offset = 1; offset <= PRELOAD_AHEAD; offset += 1) {
        const target = page.value + offset
        if (totalPages.value && target > totalPages.value) {
          return
        }
        if (preloaded.has(target)) {
          continue
        }
        preloaded.add(target)
        new Image().src = galleryImageUrl(gid, token, target)
      }
    }

    const reportProgress = useDebounceFn(() => {
      void saveProgress(gid, token, page.value).catch(() => undefined)
    }, PROGRESS_DEBOUNCE_MS)

    function onKeydown(event: KeyboardEvent) {
      const step = PAGE_STEPS[event.key]
      if (step) {
        event.preventDefault()
        goTo(page.value + step)
        return
      }
      if (event.key === "Home") {
        event.preventDefault()
        goTo(1)
      } else if (event.key === "End") {
        event.preventDefault()
        goTo(totalPages.value)
      } else if (event.key === "Escape") {
        event.preventDefault()
        void router.push({ name: "gallery-detail", params: { gid, token } })
      }
    }

    /* 按点击位置分三段：左边上一页，右边下一页，中间只是唤出操作栏 */
    function onClick(event: MouseEvent) {
      const { clientX, currentTarget } = event
      const width = (currentTarget as HTMLElement).clientWidth
      if (clientX < width / 3) {
        goTo(page.value - 1)
      } else if (clientX > (width * 2) / 3) {
        goTo(page.value + 1)
      } else {
        showChrome()
      }
    }

    /* useEventListener 在组件卸载时自动摘掉监听 */
    useEventListener(window, "keydown", onKeydown)

    onMounted(async () => {
      showChrome()
      try {
        gallery.value = (await fetchGalleryDetail(gid, token)).gallery
        preload()
      } catch (error) {
        errorMessage.value = errorText(error, "加载失败")
      }
    })

    /* 翻页的全部副作用集中在这里，goTo 只管改地址 */
    watch(page, () => {
      imageFailed.value = false
      /* 让地址回到预取用的那个形式 */
      retryNonce.value = 0
      showChrome()
      preload()
      void reportProgress()
    })

    return () => (
      <div class="fixed inset-0 flex flex-col bg-black">
        {errorMessage.value ? (
          <div class="flex flex-1 items-center justify-center p-4">
            <div class="max-w-md">
              <ErrorAlert message={errorMessage.value} title="打不开这个图集">
                <Button size="sm" variant="outline" {...{ onClick: () => router.back() }}>
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
                  {...{
                    onClick: (event: MouseEvent) => {
                      event.stopPropagation()
                      imageFailed.value = false
                      retryNonce.value += 1
                    },
                  }}
                >
                  重试
                </Button>
              </div>
            ) : (
              <img
                alt={`第 ${page.value} 页`}
                class="max-h-svh max-w-full object-contain"
                key={currentSrc.value}
                src={currentSrc.value}
                {...{ onError: () => (imageFailed.value = true) }}
              />
            )}

            {!gallery.value && !imageFailed.value ? (
              <Skeleton class="absolute inset-x-1/4 inset-y-8 -z-10 rounded-lg" />
            ) : null}
          </div>
        )}

        {/* 操作栏浮在图片上方，静置几秒后淡出，不挡画面 */}
        <div
          class={[
            "pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 transition-opacity",
            chromeVisible.value ? "opacity-100" : "opacity-0",
          ]}
        >
          <Button
            aria-label="退出阅读"
            {...chromeButton}
            {...{ onClick: () => router.push({ name: "gallery-detail", params: { gid, token } }) }}
          >
            <XIcon />
          </Button>
          <p class="min-w-0 flex-1 truncate text-sm text-white/90">{gallery.value?.title ?? "加载中…"}</p>
        </div>

        <div
          class={[
            "pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent p-3 transition-opacity",
            chromeVisible.value ? "opacity-100" : "opacity-0",
          ]}
        >
          <Button
            aria-label="上一页"
            {...chromeButton}
            {...{ disabled: page.value <= 1, onClick: () => goTo(page.value - 1) }}
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
              disabled: totalPages.value > 0 && page.value >= totalPages.value,
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
