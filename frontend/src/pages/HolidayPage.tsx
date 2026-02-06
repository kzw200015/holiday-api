import { computed, defineComponent, onMounted, ref } from "vue"
import { Calendar, CircleCheckFilled, CircleCloseFilled, Clock } from "@element-plus/icons-vue"
import {
    ElButton,
    ElCard,
    ElCol,
    ElDatePicker,
    ElDescriptions,
    ElDescriptionsItem,
    ElIcon,
    ElMessage,
    ElRow,
    ElTag,
    ElText,
} from "element-plus"

import { queryIsHoliday } from "@/api/HolidayApi"
import { addDays, formatDateForInput } from "@/utils/DateUtils"

const NEXT_OFF_DAY_SEARCH_RANGE = 60

type HolidayQueryResult = {
    isHoliday?: boolean
    nextOffDayDate?: string
    daysToNextOffDay?: number
}

async function queryNextOffDay(baseDateText: string): Promise<Pick<HolidayQueryResult, "nextOffDayDate" | "daysToNextOffDay">> {
    for (let i = 1; i <= NEXT_OFF_DAY_SEARCH_RANGE; i += 1) {
        const candidateDate = addDays(baseDateText, i)
        const candidateResult = await queryIsHoliday(candidateDate)

        if (candidateResult) {
            return {
                nextOffDayDate: candidateDate,
                daysToNextOffDay: i,
            }
        }
    }

    throw new Error(`未找到下一个休息日（查询范围：${NEXT_OFF_DAY_SEARCH_RANGE}天）`)
}

export default defineComponent({
    name: "HolidayPage",
    setup() {
        const date = ref(formatDateForInput(new Date()))
        const loading = ref(false)
        const result = ref<HolidayQueryResult>({})

        const refresh = async () => {
            loading.value = true

            try {
                const baseDateText = date.value || formatDateForInput(new Date())
                const currentIsHoliday = await queryIsHoliday(date.value || undefined)

                if (currentIsHoliday) {
                    result.value = {
                        isHoliday: true,
                        nextOffDayDate: baseDateText,
                        daysToNextOffDay: 0,
                    }
                    return
                }

                const nextOffDay = await queryNextOffDay(baseDateText)
                result.value = {
                    isHoliday: false,
                    ...nextOffDay,
                }
            } catch (error) {
                result.value = {}
                ElMessage.error(error instanceof Error ? error.message : String(error))
            } finally {
                loading.value = false
            }
        }

        onMounted(() => {
            void refresh()
        })

        const title = computed(() => {
            if (result.value.isHoliday === undefined) {
                return "未查询"
            }

            return result.value.isHoliday ? "休息日" : "工作日"
        })

        const currentDateText = computed(() => (date.value ? `日期：${date.value}` : "日期：今天"))

        const nextOffDayText = computed(() => {
            if (loading.value) {
                return "计算中..."
            }

            if (result.value.daysToNextOffDay === undefined) {
                return "-"
            }

            return `${result.value.daysToNextOffDay} 天`
        })

        const nextOffDayDateText = computed(() => {
            if (loading.value) {
                return "日期：计算中..."
            }

            if (result.value.nextOffDayDate) {
                return `日期：${result.value.nextOffDayDate}`
            }

            return "日期：-"
        })

        const ResultIcon = computed(() => {
            if (result.value.isHoliday === undefined) {
                return CircleCloseFilled
            }

            return CircleCheckFilled
        })

        return () => (
            <section class="grid gap-4">
                <div class="grid gap-2">
                    <div class="flex items-center gap-2">
                        <h1 class="m-0 text-2xl font-semibold tracking-tight">节假日</h1>
                        <ElTag type="info">后端接口</ElTag>
                    </div>
                    <ElText class="text-[var(--el-text-color-secondary)]">
                        通过后端接口判断某一天是否为休息日（包含法定节假日与调休）。
                    </ElText>
                </div>

                <ElRow gutter={16} class="gap-y-4">
                    <ElCol xs={24} md={8}>
                        <ElCard
                            class="h-full rounded-xl"
                            shadow="never"
                            v-slots={{
                                header: () => (
                                    <div class="flex items-center gap-1.5 font-semibold">
                                        <ElIcon>
                                            <Calendar />
                                        </ElIcon>
                                        <span>查询</span>
                                    </div>
                                ),
                            }}
                        >
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
                                <ElButton type="primary" loading={loading.value} onClick={() => void refresh()}>
                                    {loading.value ? "查询中..." : "查询"}
                                </ElButton>
                            </div>

                            <ElText class="text-[var(--el-text-color-secondary)]">支持留空（后端默认使用当天日期）。</ElText>
                        </ElCard>
                    </ElCol>

                    <ElCol xs={24} md={8}>
                        <ElCard
                            class="h-full rounded-xl"
                            shadow="never"
                            v-slots={{
                                header: () => (
                                    <div class="flex items-center gap-1.5 font-semibold">
                                        <ElIcon>
                                            <ResultIcon.value />
                                        </ElIcon>
                                        <span>当天结果</span>
                                    </div>
                                ),
                            }}
                        >
                            <ElDescriptions column={1} border>
                                <ElDescriptionsItem label="状态">{title.value}</ElDescriptionsItem>
                                <ElDescriptionsItem label="日期">{currentDateText.value}</ElDescriptionsItem>
                            </ElDescriptions>
                        </ElCard>
                    </ElCol>

                    <ElCol xs={24} md={8}>
                        <ElCard
                            class="h-full rounded-xl"
                            shadow="never"
                            v-slots={{
                                header: () => (
                                    <div class="flex items-center gap-1.5 font-semibold">
                                        <ElIcon>
                                            <Clock />
                                        </ElIcon>
                                        <span>下一个休息日</span>
                                    </div>
                                ),
                            }}
                        >
                            <ElDescriptions column={1} border>
                                <ElDescriptionsItem label="剩余时间">{nextOffDayText.value}</ElDescriptionsItem>
                                <ElDescriptionsItem label="目标日期">{nextOffDayDateText.value}</ElDescriptionsItem>
                            </ElDescriptions>
                        </ElCard>
                    </ElCol>
                </ElRow>
            </section>
        )
    },
})
