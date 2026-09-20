<script setup lang="ts">
import { getLocalTimeZone, parseDate, today, type DateValue } from "@internationalized/date"
import { BriefcaseIcon, PartyPopperIcon } from "@lucide/vue"
import { computed, shallowRef } from "vue"

import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useHolidayDetail } from "@/features/holiday/composables/useHolidayDetail"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"

const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
/* DateValue 是带私有字段的不可变对象，避免深度解包。 */
const selected = shallowRef<DateValue>(today(getLocalTimeZone()))
const { detail, loading, errorMessage, reload } = useHolidayDetail(() => selected.value.toString())
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
/* 按日历日期取星期，避免时区偏移导致差一天。 */
const weekday = computed(() =>
  detail.value ? weekdayNames[parseDate(detail.value.date).toDate(getLocalTimeZone()).getDay()] : "",
)
/* 再次点击选中日期可能传出 undefined，此时保持原选中。 */
function onSelect(value: DateValue | DateValue[] | undefined) {
  if (!value || Array.isArray(value)) {
    return
  }
  selected.value = value
}
</script>

<template>
  <div class="page-content grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
    <Card class="w-fit">
      <CardHeader>
        <CardTitle>选择日期</CardTitle>
        <CardDescription>点击日历中的日期即可查询。</CardDescription>
      </CardHeader>
      <CardContent>
        <Calendar
          class="p-0 [--cell-size:--spacing(9)]"
          fixed-weeks
          locale="zh-CN"
          :model-value="selected"
          :week-starts-on="1"
          @update:model-value="onSelect"
        />
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>查询结果</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-3">
        <template v-if="loading">
          <Skeleton class="h-8 w-48" />
          <Skeleton class="h-4 w-64" />
          <Skeleton class="h-4 w-40" />
        </template>
        <ErrorAlert v-else-if="errorMessage" :message="errorMessage" title="查询失败" retryable @retry="reload" />
        <template v-else-if="detail">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-2xl font-semibold tabular-nums">{{ detail.date }}</span>
            <span class="text-muted-foreground text-sm">{{ weekday }}</span>
            <Badge :variant="detail.isOffDay ? 'default' : 'secondary'">
              <PartyPopperIcon v-if="detail.isOffDay" />
              <BriefcaseIcon v-else />
              {{ detail.isOffDay ? "休息日" : "工作日" }}
            </Badge>
          </div>
          <p class="text-sm">{{ summary }}</p>
          <p class="text-muted-foreground text-sm">对应节假日：{{ detail.name || "无（不在节假日安排中）" }}</p>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
