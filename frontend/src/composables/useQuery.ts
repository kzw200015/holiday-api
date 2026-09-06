import { ref, shallowRef, watch, type WatchSource } from "vue"

/** 页面查询随参数变化重新加载；卸载或换参数后，旧响应不能再写入页面。 */
export function useQuery<Params, Data>(
  source: WatchSource<Params>,
  request: (params: Params, signal: AbortSignal) => Promise<Data>,
) {
  const data = shallowRef<Data | null>(null)
  const error = shallowRef<Error | null>(null)
  const loading = ref(true)

  watch(
    source,
    async (params, _previous, onCleanup) => {
      const controller = new AbortController()
      onCleanup(() => controller.abort())
      data.value = null
      error.value = null
      loading.value = true

      try {
        const result = await request(params, controller.signal)
        if (!controller.signal.aborted) {
          data.value = result
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          /* HTTP 层已统一为 Error，页面只负责展示。 */
          error.value = cause as Error
        }
      } finally {
        if (!controller.signal.aborted) {
          loading.value = false
        }
      }
    },
    { immediate: true },
  )

  return { data, error, loading }
}
