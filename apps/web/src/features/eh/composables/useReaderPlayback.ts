import { readerIntervalSchema } from "@myapi/shared/eh"
import { useDocumentVisibility, useIntervalFn } from "@vueuse/core"
import { computed, onScopeDispose, reactive, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue"

import { useGalleryPreferences } from "@/features/eh/composables/useGalleryPreferences"

export interface ReaderPlaybackState {
  autoPaging: boolean
  canStart: boolean
  interval: number
  /* 偏好读到了才能调间隔：没读到时调了也存不上，按钮不该看起来能用。 */
  intervalReady: boolean
  /* 偏好读失败了，控件据此给出重试。 */
  intervalFailed: boolean
}

/** 一次阅读的自动翻页与间隔；控件只展示状态并发出操作。 */
export function useReaderPlayback(
  page: Ref<number>,
  total: MaybeRefOrGetter<number>,
  interacting: MaybeRefOrGetter<boolean>,
) {
  const autoPaging = ref(false)
  const visibility = useDocumentVisibility()
  const canStart = computed(() => toValue(total) > 0 && page.value < toValue(total) && visibility.value === "visible")
  const preferences = useGalleryPreferences()

  /* 间隔改了当场生效，存哪去、什么时候存都不是这里的事。 */
  function changeInterval(seconds: number) {
    /* 超出范围的整份提交会被服务端退回，之后每次保存都跟着失败，所以当场挡掉。 */
    if (!readerIntervalSchema.safeParse(seconds).success) {
      return
    }
    preferences.interval.value = seconds
  }

  const { pause, resume } = useIntervalFn(
    () => {
      if (canStart.value && !toValue(interacting)) {
        page.value += 1
      }
    },
    computed(() => preferences.interval.value * 1000),
    { immediate: false },
  )

  function stop() {
    autoPaging.value = false
  }

  function toggle() {
    if (autoPaging.value) {
      stop()
    } else if (canStart.value) {
      autoPaging.value = true
    }
  }

  /* 翻不动就停下，不记「等会儿接着翻」：读到最后一页、切去别的标签页，都要重新点开始。 */
  watch(
    canStart,
    (allowed) => {
      if (!allowed) {
        stop()
      }
    },
    { flush: "sync" },
  )

  /* 手动换页不重计时；拖动暂停，松开后等待完整间隔。 */
  watch(
    [autoPaging, () => toValue(interacting)],
    () => {
      if (autoPaging.value && !toValue(interacting)) {
        resume()
      } else {
        pause()
      }
    },
    { flush: "sync" },
  )

  keepScreenOn(autoPaging)

  const state: ReaderPlaybackState = reactive({
    autoPaging,
    canStart,
    interval: preferences.interval,
    intervalReady: preferences.ready,
    intervalFailed: computed(() => !preferences.ready.value && preferences.loadError.value !== ""),
  })
  return { state, changeInterval, toggle, stop, reloadInterval: preferences.reload }
}

/**
 * 开着的时候不让屏幕熄灭，否则手机过一会儿就息屏，自动翻页翻了也看不见。
 * 拿不到（浏览器不支持、省电模式下被拒）就照常翻，只是会息屏。切去后台时浏览器自己会收回，自动翻页那时也停了。
 * 不用 VueUse 的 useWakeLock：申请还没拿到就放开时，它等申请回来又把锁记上，这把锁就一直挂着。
 */
function keepScreenOn(active: Ref<boolean>) {
  /* 申请是异步的：还没拿到就要放开时，等拿到了再放，不然这把锁就一直挂着。 */
  let lock: Promise<WakeLockSentinel | undefined> | undefined

  function release() {
    void lock?.then((sentinel) => sentinel?.release())
    lock = undefined
  }

  watch(
    active,
    (on) => {
      if (!on) {
        release()
      } else if ("wakeLock" in navigator) {
        lock = navigator.wakeLock.request("screen").catch(() => undefined)
      }
    },
    { flush: "sync" },
  )
  onScopeDispose(release)
}
