import { useQuery } from "@tanstack/vue-query"
import { computed, toValue, type MaybeRefOrGetter } from "vue"

import { fetchHolidayDetail, HOLIDAY_STALE_TIME, holidayKeys } from "@/features/holiday/api"

/** 某一天是不是休息日。日期变了就是另一份查询，问过的日子直接命中缓存。 */
export function useHolidayDetail(date: MaybeRefOrGetter<string>) {
  const query = useQuery({
    queryKey: computed(() => holidayKeys.detail(toValue(date))),
    queryFn: ({ signal }) => fetchHolidayDetail(toValue(date), signal),
    staleTime: HOLIDAY_STALE_TIME,
  })

  return {
    detail: query.data,
    loading: query.isPending,
    errorMessage: computed(() => query.error.value?.message ?? ""),
    reload: () => void query.refetch(),
  }
}
