import { getLocalTimeZone, parseDate, today, type DateValue } from "@internationalized/date"
import { BriefcaseIcon, CircleAlertIcon, PartyPopperIcon } from "@lucide/vue"
import { computed, defineComponent, onMounted, ref, shallowRef } from "vue"

import { fetchHolidayDetail, type HolidayDetail } from "@/api/holiday"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/* 星期名称，下标对应 Date.getDay() 的 0 至 6 */
const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

/* 节假日查询页：在日历上点选日期，查询当天是否放假及对应的节假日 */
export default defineComponent({
  name: "HolidayView",
  setup() {
    /* DateValue 是带私有字段的不可变对象，用 shallowRef 避免 ref 深度解包丢失类型 */
    const selected = shallowRef<DateValue>(today(getLocalTimeZone()))
    const detail = ref<HolidayDetail | null>(null)
    const errorMessage = ref("")
    const loading = ref(false)

    /* 结论文案：区分法定假期、普通周末、调休上班与普通工作日 */
    const summary = computed(() => {
      const value = detail.value
      if (!value) {
        return ""
      }
      if (value.isOffDay) {
        return value.name ? `${value.name}法定假期，不用上班。` : "普通周末，不用上班。"
      }
      return value.name ? `${value.name}假期调休，需要上班。` : "普通工作日，需要上班。"
    })

    /* 后端返回的是 YYYY-MM-DD，先解析成日历日期再取星期，避免时区偏移导致差一天 */
    const weekday = computed(() =>
      detail.value
        ? weekdayNames[parseDate(detail.value.date).toDate(getLocalTimeZone()).getDay()]
        : "",
    )

    /* 查询指定日期，失败时清空上一次结果 */
    async function query(date: string) {
      loading.value = true
      errorMessage.value = ""
      try {
        detail.value = await fetchHolidayDetail(date)
      } catch (error) {
        detail.value = null
        errorMessage.value = error instanceof Error ? error.message : "查询失败"
      } finally {
        loading.value = false
      }
    }

    /* 日历选中变化即查询；点击已选中的日期时 reka-ui 会传出 undefined，此时保持原选中 */
    function onSelect(value: DateValue | DateValue[] | undefined) {
      if (!value || Array.isArray(value)) {
        return
      }
      selected.value = value
      void query(value.toString())
    }

    /* 进入页面先查询当天 */
    onMounted(() => query(selected.value.toString()))

    return () => (
      <div class="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-start">
        <Card class="w-fit">
          <CardHeader>
            <CardTitle>选择日期</CardTitle>
            <CardDescription>点击日历中的日期即可查询。</CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              class="p-0 [--cell-size:--spacing(9)]"
              fixedWeeks
              locale="zh-CN"
              modelValue={selected.value}
              weekStartsOn={1}
              {...{ "onUpdate:modelValue": onSelect }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>查询结果</CardTitle>
          </CardHeader>
          <CardContent class="flex flex-col gap-3">
            {loading.value ? (
              <>
                <Skeleton class="h-8 w-48" />
                <Skeleton class="h-4 w-64" />
                <Skeleton class="h-4 w-40" />
              </>
            ) : errorMessage.value ? (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>查询失败</AlertTitle>
                <AlertDescription>{errorMessage.value}</AlertDescription>
              </Alert>
            ) : detail.value ? (
              <>
                <div class="flex flex-wrap items-center gap-3">
                  <span class="text-2xl font-semibold tabular-nums">{detail.value.date}</span>
                  <span class="text-muted-foreground text-sm">{weekday.value}</span>
                  <Badge variant={detail.value.isOffDay ? "default" : "secondary"}>
                    {detail.value.isOffDay ? <PartyPopperIcon /> : <BriefcaseIcon />}
                    {detail.value.isOffDay ? "休息日" : "工作日"}
                  </Badge>
                </div>

                <p class="text-sm">{summary.value}</p>

                <p class="text-muted-foreground text-sm">
                  对应节假日：{detail.value.name || "无（不在节假日安排中）"}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    )
  },
})
