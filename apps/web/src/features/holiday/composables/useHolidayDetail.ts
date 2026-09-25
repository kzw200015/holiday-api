import { useQuery } from "@pinia/colada"
import { computed, toValue, type MaybeRefOrGetter } from "vue"

import { fetchHolidayDetail } from "@/features/holiday/api"

/** 某一天是不是休息日。换日期就查那一天，上一次还没回来的请求随之作废。 */
export function useHolidayDetail(date: MaybeRefOrGetter<string>) {
  const query = useQuery(() => {
    const day = toValue(date)
    return { key: ["holiday", day], query: ({ signal }) => fetchHolidayDetail(day, signal) }
  })

  return {
    detail: query.data,
    loading: computed(() => query.data.value === undefined && query.error.value === null),
    errorMessage: computed(() => query.error.value?.message ?? ""),
    reload: () => void query.refresh(),
  }
}
