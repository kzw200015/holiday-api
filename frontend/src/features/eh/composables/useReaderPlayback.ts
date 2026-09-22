import { useDocumentVisibility, useIntervalFn } from "@vueuse/core"
import { computed, reactive, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue"

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

  const state: ReaderPlaybackState = reactive({
    autoPaging,
    canStart,
    interval: preferences.interval,
    intervalReady: preferences.ready,
    intervalFailed: computed(() => !preferences.ready.value && preferences.loadError.value !== ""),
  })
  return { state, changeInterval, toggle, stop, reloadInterval: preferences.reload }
}
