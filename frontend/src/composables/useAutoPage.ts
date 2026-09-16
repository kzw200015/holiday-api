import { useDocumentVisibility, useIntervalFn } from "@vueuse/core"
import { computed, ref, watch, type Ref } from "vue"

import { usePersistedValue } from "@/composables/usePersistedValue"

function normalizeInterval(raw: unknown) {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 20 ? raw : 5
}

/** 自动翻页只控制前进节奏，图片加载和手动换页不参与计时。 */
export function useAutoPage(
  state: { identity: Ref<string>; page: Ref<number>; total: Ref<number>; dragging: Ref<boolean> },
  goTo: (page: number) => void,
  userId: number | undefined,
) {
  const { value: interval, set: setInterval } = usePersistedValue("reader-interval", userId, normalizeInterval)
  const active = ref(false)
  const visibility = useDocumentVisibility()
  const canStart = computed(
    () => state.total.value > 0 && state.page.value < state.total.value && visibility.value === "visible",
  )
  const { pause, resume } = useIntervalFn(
    () => {
      if (canStart.value && !state.dragging.value) {
        goTo(state.page.value + 1)
      }
    },
    computed(() => interval.value * 1000),
    { immediate: false },
  )

  function stop() {
    active.value = false
    pause()
  }

  function toggle() {
    if (active.value) {
      stop()
    } else if (canStart.value) {
      active.value = true
    }
  }

  watch(
    [state.identity, canStart],
    ([identity, allowed], [previousIdentity]) => {
      if (identity !== previousIdentity || !allowed) {
        stop()
      }
    },
    { flush: "sync" },
  )
  /* 只在开关、拖动或间隔改变时重计时，手动换页保持原来的节奏。 */
  watch(
    [active, state.dragging, interval],
    () => {
      pause()
      if (active.value && !state.dragging.value) {
        resume()
      }
    },
    { flush: "sync" },
  )

  return { active, canStart, interval, setInterval, toggle, stop }
}
