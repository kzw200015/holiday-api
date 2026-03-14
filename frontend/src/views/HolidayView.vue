<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import dayjs from "dayjs"
import { Calendar, CircleCheckFilled, CircleCloseFilled, Clock } from "@element-plus/icons-vue"
import { ElButton, ElCard, ElDatePicker, ElDescriptions, ElDescriptionsItem, ElIcon, ElTag, ElText } from "element-plus"

import { isHoliday, type NextOffDayResult, queryNextOffDay } from "@/api/holidayApi"

type HolidayQueryResult = NextOffDayResult & { isHoliday: boolean }

const date = ref(dayjs().format("YYYY-MM-DD"))
const loading = ref(false)
const result = ref<HolidayQueryResult | null>(null)

const refresh = async () => {
  loading.value = true

  try {
    const [holiday, nextOffDay] = await Promise.all([
      isHoliday(date.value || undefined),
      queryNextOffDay(date.value || undefined),
    ])

    result.value = { isHoliday: holiday, ...nextOffDay }
  } catch {
    result.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refresh()
})

/* 当天查询结果文案 */
const title = computed(() => {
  if (!result.value) {
    return "未查询"
  }
  return result.value.isHoliday ? "休息日" : "工作日"
})

/* 下一个休息日倒计时文案 */
const nextOffDayText = computed(() => {
  if (loading.value) {
    return "计算中..."
  }
  if (!result.value) {
    return "-"
  }
  return `${result.value.daysToNextOffDay} 天`
})
</script>

<template>
  <section>
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <ElText class="m-0 text-2xl font-semibold tracking-tight">节假日</ElText>
          <ElTag type="info">后端接口</ElTag>
        </div>
        <ElText class="text-[var(--el-text-color-secondary)]">
          通过后端接口判断某一天是否为休息日（包含法定节假日与调休）。
        </ElText>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <ElCard class="h-full rounded-xl" shadow="never">
            <template #header>
              <div class="flex items-center gap-1.5">
                <ElIcon><Calendar /></ElIcon>
                <ElText class="font-semibold">查询</ElText>
              </div>
            </template>
            <div class="mb-2.5 flex flex-wrap items-center gap-3">
              <ElDatePicker
                class="w-[220px]"
                :model-value="date"
                type="date"
                value-format="YYYY-MM-DD"
                format="YYYY-MM-DD"
                placeholder="选择日期"
                clearable
                :disabled="loading"
                @update:model-value="date = $event ? String($event) : ''"
              />
              <ElButton type="primary" :loading="loading" @click="refresh()">
                {{ loading ? "查询中..." : "查询" }}
              </ElButton>
            </div>
            <ElText class="text-xs text-[var(--el-text-color-secondary)]">
              支持留空（后端默认使用当天日期）。
            </ElText>
          </ElCard>
        </div>

        <div>
          <ElCard class="h-full rounded-xl" shadow="never">
            <template #header>
              <div class="flex items-center gap-1.5">
                <ElIcon>
                  <CircleCheckFilled v-if="result" />
                  <CircleCloseFilled v-else />
                </ElIcon>
                <ElText class="font-semibold">当天结果</ElText>
              </div>
            </template>
            <ElDescriptions :column="1" border>
              <ElDescriptionsItem label="状态">{{ title }}</ElDescriptionsItem>
              <ElDescriptionsItem label="日期">{{ date || "今天" }}</ElDescriptionsItem>
            </ElDescriptions>
          </ElCard>
        </div>

        <div>
          <ElCard class="h-full rounded-xl" shadow="never">
            <template #header>
              <div class="flex items-center gap-1.5">
                <ElIcon><Clock /></ElIcon>
                <ElText class="font-semibold">下一个休息日</ElText>
              </div>
            </template>
            <ElDescriptions :column="1" border>
              <ElDescriptionsItem label="剩余时间">{{ nextOffDayText }}</ElDescriptionsItem>
              <ElDescriptionsItem label="目标日期">
                {{ loading ? "计算中..." : (result?.nextOffDayDate ?? "-") }}
              </ElDescriptionsItem>
            </ElDescriptions>
          </ElCard>
        </div>
      </div>
    </div>
  </section>
</template>
