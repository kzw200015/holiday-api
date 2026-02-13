import { defineComponent, onMounted, ref } from "vue"
import { RefreshRight } from "@element-plus/icons-vue"
import { ElButton, ElCard, ElText } from "element-plus"

import { getCodexTodayTokenUsage, type TodayTokenUsage } from "@/api/codexApi.ts"

function formatCompactTokenCount(value: number) {
  const absoluteValue = Math.abs(value)
  if (absoluteValue >= 1_000_000) {
    return `${formatCompactNumber(value / 1_000_000)}M`
  }
  if (absoluteValue >= 1_000) {
    return `${formatCompactNumber(value / 1_000)}K`
  }
  return new Intl.NumberFormat("zh-CN").format(value)
}

function formatCompactNumber(value: number) {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")
}

export default defineComponent({
  name: "CodexTokenUsageCard",
  setup() {
    const loading = ref(false)
    const usage = ref<TodayTokenUsage>({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
    })

    const refreshTodayTokenUsage = async () => {
      loading.value = true
      try {
        usage.value = await getCodexTodayTokenUsage()
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      void refreshTodayTokenUsage()
    })

    return () => (
      <ElCard class="rounded-xl" shadow="never">
        {{
          header: () => (
            <div class="flex items-center justify-between gap-3">
              <ElText class="font-semibold">今日 Token 统计</ElText>
              <ElButton
                icon={RefreshRight}
                loading={loading.value}
                onClick={() => {
                  void refreshTodayTokenUsage()
                }}
              >
                刷新
              </ElButton>
            </div>
          ),
          default: () => (
            <div class="bg-[var(--el-fill-color-blank)] p-5">
              <div class="overflow-x-auto">
                <div
                  class="mx-auto grid min-w-[700px] justify-center gap-x-4 gap-y-2 md:gap-x-6"
                  style={{ gridTemplateColumns: "minmax(200px,auto) auto minmax(150px,auto) auto minmax(180px,auto)" }}
                >
                  <ElText class="text-center text-[11px] tracking-[0.14em] text-[var(--el-text-color-secondary)]">
                    输入
                  </ElText>
                  <div/>
                  <ElText class="text-center text-[11px] tracking-[0.14em] text-[var(--el-text-color-secondary)]">
                    输出
                  </ElText>
                  <div/>
                  <ElText class="text-center text-[11px] tracking-[0.14em] text-[var(--el-color-primary)]">
                    总量
                  </ElText>

                  <ElText class="text-center text-4xl font-semibold leading-none tabular-nums">
                    {formatCompactTokenCount(usage.value.inputTokens)}
                  </ElText>
                  <ElText class="text-center text-3xl font-semibold leading-none text-[var(--el-text-color-secondary)] md:text-4xl">
                    +
                  </ElText>
                  <ElText class="text-center text-4xl font-semibold leading-none tabular-nums">
                    {formatCompactTokenCount(usage.value.outputTokens)}
                  </ElText>
                  <ElText class="text-center text-3xl font-semibold leading-none text-[var(--el-text-color-secondary)] md:text-4xl">
                    =
                  </ElText>
                  <div class="px-4 py-2 text-center">
                    <ElText class="text-4xl font-semibold leading-none text-[var(--el-color-primary)] tabular-nums">
                      {formatCompactTokenCount(usage.value.totalTokens)}
                    </ElText>
                  </div>

                  <ElText class="justify-self-center rounded-full bg-[var(--el-fill-color-light)] px-2.5 py-1 text-xs text-[var(--el-text-color-secondary)]">
                    缓存输入 {formatCompactTokenCount(usage.value.cachedInputTokens)}
                  </ElText>
                  <div/>
                  <div/>
                  <div/>
                  <div/>
                </div>
              </div>
            </div>
          ),
        }}
      </ElCard>
    )
  },
})
