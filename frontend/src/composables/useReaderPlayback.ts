import { useDocumentVisibility, useIntervalFn, useTimeoutFn } from "@vueuse/core"
import {
  computed,
  onMounted,
  onScopeDispose,
  reactive,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type WatchSource,
} from "vue"
import { onBeforeRouteLeave } from "vue-router"

import { useGalleryPreferences } from "@/composables/useGalleryPreferences"

export interface ReaderPlaybackState {
  autoPaging: boolean
  canStart: boolean
  interval: number
  loading: boolean
  saving: boolean
  errorMessage: string
}

/** 一次阅读的自动翻页与间隔保存；控件只展示状态并发出操作。 */
export function useReaderPlayback(
  identity: WatchSource<string>,
  page: Ref<number>,
  total: MaybeRefOrGetter<number>,
  interacting: MaybeRefOrGetter<boolean>,
) {
  const autoPaging = ref(false)
  const visibility = useDocumentVisibility()
  const canStart = computed(() => toValue(total) > 0 && page.value < toValue(total) && visibility.value === "visible")
  const preferences = useGalleryPreferences()
  /* 只关心「上一次保存有没有跑完」，结果本身用不上。 */
  let saving: Promise<unknown> = Promise.resolve()
  let revision = 0

  function persistInterval() {
    saving = preferences.saveInterval()
    return saving
  }

  const {
    start: scheduleSave,
    stop: cancelSave,
    isPending: savePending,
  } = useTimeoutFn(persistInterval, 1000, { immediate: false })

  function setInterval(seconds: number) {
    preferences.interval.value = seconds
    scheduleSave()
  }

  function flushInterval() {
    if (savePending.value) {
      cancelSave()
      return persistInterval()
    }
    return saving
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

  onMounted(preferences.load)
  watch(identity, async () => {
    stop()
    const current = ++revision
    /* 新图集读取偏好前，先完成上一图集已提交的间隔保存。 */
    await flushInterval()
    if (current === revision) {
      await preferences.load()
    }
  })
  onBeforeRouteLeave(() => {
    stop()
    void flushInterval()
  })
  onScopeDispose(() => {
    revision += 1
  })

  const state: ReaderPlaybackState = reactive({
    autoPaging,
    canStart,
    interval: preferences.interval,
    loading: preferences.loading,
    saving: preferences.saving,
    errorMessage: preferences.errorMessage,
  })
  return { state, setInterval, toggle }
}
