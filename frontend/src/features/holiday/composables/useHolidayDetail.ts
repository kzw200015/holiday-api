import { toValue, type MaybeRefOrGetter } from "vue"

import { fetchHolidayDetail } from "@/features/holiday/api"
import { useRequest } from "@/shared/composables/useRequest"

/** 某一天是不是休息日。日期变了就丢掉上一天的结果重新查，上一次还没回来的请求一并取消。 */
export function useHolidayDetail(date: MaybeRefOrGetter<string>) {
  const { data, loading, errorMessage, reload } = useRequest([() => toValue(date)], (signal) =>
    fetchHolidayDetail(toValue(date), signal),
  )

  return { detail: data, loading, errorMessage, reload }
}
