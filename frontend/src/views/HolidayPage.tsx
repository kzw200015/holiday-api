import { computed, defineComponent, onMounted, ref } from "vue"
import { Calendar, CircleCheckFilled, CircleCloseFilled, Clock } from "@element-plus/icons-vue"
import { ElButton, ElCard, ElDatePicker, ElDescriptions, ElDescriptionsItem, ElIcon, ElTag, ElText } from "element-plus"

import { isHoliday, queryNextOffDay } from "@/api/holidayApi.ts"
import { formatDateForInput } from "@/utils/DateUtils"

type HolidayQueryResult = {
  isHoliday: boolean
  nextOffDayDate: string
  daysToNextOffDay: number
}

export default defineComponent({
  name: "HolidayPage",
  setup() {
    const date = ref(formatDateForInput(new Date()))
    const loading = ref(false)
    const result = ref<HolidayQueryResult | null>(null)

    const refresh = async () => {
      loading.value = true

      try {
        const [holiday, nextOffDay] = await Promise.all([
          isHoliday(date.value || undefined),
          queryNextOffDay(date.value || undefined),
        ])

        result.value = {
          isHoliday: holiday,
          nextOffDayDate: nextOffDay.nextOffDayDate,
          daysToNextOffDay: nextOffDay.daysToNextOffDay,
        }
      } catch {
        result.value = null
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      void refresh()
    })

    const title = computed(() => {
      if (!result.value) {
        return "未查询"
      }

      return result.value.isHoliday ? "休息日" : "工作日"
    })

    const currentDateText = computed(() => (date.value ? `日期：${date.value}` : "日期：今天"))

    const nextOffDayText = computed(() => {
      if (loading.value) {
        return "计算中..."
      }

      if (!result.value) {
        return "-"
      }

      return `${result.value.daysToNextOffDay} 天`
    })

    const nextOffDayDateText = computed(() => {
      if (loading.value) {
        return "日期：计算中..."
      }

      if (result.value) {
        return `日期：${result.value.nextOffDayDate}`
      }

      return "日期：-"
    })

    const ResultIcon = computed(() => {
      if (!result.value) {
        return CircleCloseFilled
      }

      return CircleCheckFilled
    })

    return () => (
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
                {{
                  header: () => (
                    <div class="flex items-center gap-1.5">
                      <ElIcon>
                        <Calendar/>
                      </ElIcon>
                      <ElText class="font-semibold">查询</ElText>
                    </div>
                  ),
                  default: () => (
                    <>
                      <div class="mb-2.5 flex flex-wrap items-center gap-3">
                        <ElDatePicker
                          class="w-[220px]"
                          modelValue={date.value}
                          type="date"
                          valueFormat="YYYY-MM-DD"
                          format="YYYY-MM-DD"
                          placeholder="选择日期"
                          clearable
                          disabled={loading.value}
                          onUpdate:modelValue={(value) => {
                            date.value = value ? String(value) : ""
                          }}
                        />
                        <ElButton type="primary" loading={loading.value}
                                  onClick={() => void refresh()}>
                          {loading.value ? "查询中..." : "查询"}
                        </ElButton>
                      </div>

                      <ElText class="text-xs text-[var(--el-text-color-secondary)]">
                        支持留空（后端默认使用当天日期）。
                      </ElText>
                    </>
                  ),
                }}
              </ElCard>
            </div>

            <div>
              <ElCard class="h-full rounded-xl" shadow="never">
                {{
                  header: () => (
                    <div class="flex items-center gap-1.5">
                      <ElIcon>
                        <ResultIcon.value/>
                      </ElIcon>
                      <ElText class="font-semibold">当天结果</ElText>
                    </div>
                  ),
                  default: () => (
                    <ElDescriptions column={1} border>
                      <ElDescriptionsItem label="状态">{title.value}</ElDescriptionsItem>
                      <ElDescriptionsItem
                        label="日期">{currentDateText.value}</ElDescriptionsItem>
                    </ElDescriptions>
                  ),
                }}
              </ElCard>
            </div>

            <div>
              <ElCard class="h-full rounded-xl" shadow="never">
                {{
                  header: () => (
                    <div class="flex items-center gap-1.5">
                      <ElIcon>
                        <Clock/>
                      </ElIcon>
                      <ElText class="font-semibold">下一个休息日</ElText>
                    </div>
                  ),
                  default: () => (
                    <ElDescriptions column={1} border>
                      <ElDescriptionsItem
                        label="剩余时间">{nextOffDayText.value}</ElDescriptionsItem>
                      <ElDescriptionsItem
                        label="目标日期">{nextOffDayDateText.value}</ElDescriptionsItem>
                    </ElDescriptions>
                  ),
                }}
              </ElCard>
            </div>
          </div>
        </div>
      </section>
    )
  },
})
