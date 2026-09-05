import { clamp, useResizeObserver, useTimeoutFn } from "@vueuse/core"
import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from "vue"

const LOAD_DELAY = 200
const PRELOAD_PAGES = 2

/** 只在滚动停稳后挂载附近图片；远处保留已知宽度，避免长图集占满解码内存。 */
export function useReaderStrip(
  props: Readonly<{ page: number; total: number; seeking: boolean }>,
  changePage: (page: number) => void,
) {
  const viewport = shallowRef<HTMLElement>()
  const height = ref(1)
  const width = ref(1)
  const ratios = ref<Record<number, number>>({})
  const loaded = ref<Set<number>>(new Set())
  const failed = ref<Set<number>>(new Set())
  const nonces = ref<Record<number, number>>({})
  const dragging = ref(false)
  let pointer: { id: number; x: number; left: number } | undefined
  let pendingAnchor: { page: number; relative: number } | undefined
  const widths = computed(() => Array.from({ length: props.total }, (_, index) => height.value * (ratios.value[index + 1] ?? 0.7)))
  const offsets = computed(() => {
    const result = [0]
    for (const item of widths.value) result.push(result[result.length - 1] + item)
    return result
  })
  const maxScroll = () => Math.max(0, offsets.value[props.total] - width.value)

  /* 横坐标落在哪一页：offsets 单调递增，二分找最后一个不超过 x 的页起点。 */
  function pageAt(x: number) {
    let low = 1
    let high = props.total
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (offsets.value[middle - 1] <= x) low = middle
      else high = middle - 1
    }
    return low
  }
  /* 页码以视口中点为准；滚到两端直接算首页/末页，宽屏一屏多页时才标得到头。 */
  function pageAtScroll(left: number) {
    if (left <= 1) return 1
    if (left >= maxScroll() - 1) return props.total
    return pageAt(left + width.value / 2)
  }

  function loadVisible() {
    if (!viewport.value) return
    const left = viewport.value.scrollLeft
    const right = left + width.value
    const first = pageAt(left)
    let last = first
    while (last < props.total && offsets.value[last] < right) last++
    /* 可见页加左右各两页，其余一律卸载。 */
    const next = new Set<number>()
    for (let page = Math.max(1, first - PRELOAD_PAGES); page <= Math.min(props.total, last + PRELOAD_PAGES); page++) next.add(page)
    loaded.value = next
  }
  const { start, stop: cancelLoad } = useTimeoutFn(loadVisible, LOAD_DELAY, { immediate: false })
  function scheduleLoad() {
    cancelLoad()
    if (dragging.value || props.seeking || !viewport.value || !props.total) return
    start()
  }

  async function jump(page: number) {
    cancelLoad()
    await nextTick()
    if (!viewport.value || !props.total) return
    const left = offsets.value[page - 1] + widths.value[page - 1] / 2 - width.value / 2
    viewport.value.scrollLeft = clamp(left, 0, maxScroll())
    scheduleLoad()
  }

  /* 按位置算页码并只在变化时上报：程序性滚动算回来还是同一页，不需要区分滚动来源。 */
  function onScroll() {
    if (!viewport.value) return
    const page = pageAtScroll(viewport.value.scrollLeft)
    if (page !== props.page) changePage(page)
    scheduleLoad()
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || (event.target instanceof HTMLElement && event.target.closest("button"))) return
    dragging.value = true
    cancelLoad()
    // 触屏保留浏览器原生惯性滚动，鼠标才需要自行搬动 scrollLeft。
    if (event.pointerType === "mouse" && viewport.value) {
      pointer = { id: event.pointerId, x: event.clientX, left: viewport.value.scrollLeft }
      viewport.value.setPointerCapture(event.pointerId)
      event.preventDefault()
    }
  }
  function onPointerMove(event: PointerEvent) {
    if (pointer?.id === event.pointerId && viewport.value) {
      viewport.value.scrollLeft = pointer.left + pointer.x - event.clientX
    }
  }
  function onPointerEnd() {
    pointer = undefined
    dragging.value = false
    scheduleLoad()
  }
  function onWheel(event: WheelEvent) {
    if (!viewport.value || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
    event.preventDefault()
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width.value : 1
    viewport.value.scrollLeft += event.deltaY * scale
  }

  async function imageLoaded(page: number, image: HTMLImageElement) {
    if (!viewport.value || !image.naturalWidth || !image.naturalHeight) return
    // 占位宽度换成真实比例时，维持当前页在视口中的相对位置；同一批到达的图片只锚定一次。
    pendingAnchor ??= { page: props.page, relative: viewport.value.scrollLeft - offsets.value[props.page - 1] }
    ratios.value[page] = image.naturalWidth / image.naturalHeight
    await nextTick()
    if (!viewport.value || !pendingAnchor) return
    const { page: anchor, relative } = pendingAnchor
    pendingAnchor = undefined
    viewport.value.scrollLeft = clamp(offsets.value[anchor - 1] + relative, 0, maxScroll())
    scheduleLoad()
  }
  function retry(page: number) {
    failed.value.delete(page)
    nonces.value[page] = (nonces.value[page] ?? 0) + 1
  }

  useResizeObserver(viewport, ([entry]) => {
    if (!entry) return
    height.value = Math.max(1, entry.contentRect.height)
    width.value = Math.max(1, entry.contentRect.width)
    void jump(props.page)
  })
  void jump(props.page)
  /* 自己滚出来的页码回流时位置已经对上，只有外部跳页才需要搬动视口。 */
  watch(() => props.page, (page) => {
    if (viewport.value && page !== pageAtScroll(viewport.value.scrollLeft)) void jump(page)
  })
  watch(() => props.seeking, scheduleLoad)
  /* 作用域结束后丢掉视口引用，等待中的跳转与图片回调据此放弃后续动作。 */
  onScopeDispose(() => { viewport.value = undefined })

  return { viewport, widths, loaded, failed, nonces, dragging, onScroll, onPointerDown, onPointerMove, onPointerEnd, onWheel, imageLoaded, retry }
}
