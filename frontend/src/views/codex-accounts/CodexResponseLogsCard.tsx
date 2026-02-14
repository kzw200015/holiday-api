import { defineComponent, onMounted, ref } from "vue"
import { RefreshRight } from "@element-plus/icons-vue"
import {
  ElButton,
  ElCard,
  ElPagination,
  ElTable,
  ElTableColumn,
  ElTag,
  ElText,
} from "element-plus"

import { listCodexResponseLogs, type ResponseLogItem } from "@/api/codexApi.ts"
import { formatDateTime } from "@/views/codex-accounts/utils.ts"

function formatRate(rate: number) {
  return `${(rate * 100).toFixed(2)}%`
}

export default defineComponent({
  name: "CodexResponseLogsCard",
  setup() {
    const loading = ref(false)
    const logs = ref<ResponseLogItem[]>([])
    const total = ref(0)
    const currentPage = ref(1)
    const pageSize = ref(10)

    const refreshLogs = async () => {
      loading.value = true
      try {
        const page = await listCodexResponseLogs(currentPage.value, pageSize.value)
        logs.value = page.items
        total.value = page.total
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      void refreshLogs()
    })

    const handleCurrentPageChange = (page: number) => {
      currentPage.value = page
      void refreshLogs()
    }

    const handlePageSizeChange = (size: number) => {
      pageSize.value = size
      currentPage.value = 1
      void refreshLogs()
    }

    return () => (
      <ElCard class="rounded-xl" shadow="never">
        {{
          header: () => (
            <div class="flex items-center justify-between gap-3">
              <ElText class="font-semibold">调用日志</ElText>
              <ElButton
                icon={RefreshRight}
                loading={loading.value}
                onClick={() => {
                  void refreshLogs()
                }}
              >
                刷新
              </ElButton>
            </div>
          ),
          default: () => (
            <>
              <ElTable data={logs.value} class="w-full" stripe v-loading={loading.value}>
                <ElTableColumn label="时间" minWidth={180}>
                  {(scope: { row: ResponseLogItem }) => (
                    <ElText>{formatDateTime(scope.row.createdAt)}</ElText>
                  )}
                </ElTableColumn>
                <ElTableColumn prop="accountName" label="账户" minWidth={160}/>
                <ElTableColumn label="调用方式" width={110}>
                  {(scope: { row: ResponseLogItem }) => (
                    <ElTag type={scope.row.isSse ? "success" : "info"}>
                      {scope.row.isSse ? "SSE" : "HTTP"}
                    </ElTag>
                  )}
                </ElTableColumn>
                <ElTableColumn prop="clientIp" label="IP" minWidth={140}/>
                <ElTableColumn prop="inputTokens" label="输入Token" width={120}/>
                <ElTableColumn prop="cachedInputTokens" label="缓存输入Token" width={130}/>
                <ElTableColumn prop="outputTokens" label="输出Token" width={110}/>
                <ElTableColumn label="缓存率" width={110}>
                  {(scope: { row: ResponseLogItem }) => (
                    <ElText>{formatRate(scope.row.cacheRate)}</ElText>
                  )}
                </ElTableColumn>
                <ElTableColumn label="首字延迟(ms)" width={130}>
                  {(scope: { row: ResponseLogItem }) => <ElText>{scope.row.firstTokenLatencyMs}</ElText>}
                </ElTableColumn>
                <ElTableColumn label="耗时(ms)" width={120}>
                  {(scope: { row: ResponseLogItem }) => <ElText>{scope.row.durationMs}</ElText>}
                </ElTableColumn>
                <ElTableColumn label="UA" minWidth={320}>
                  {(scope: { row: ResponseLogItem }) => (
                    <ElText class="break-all">{scope.row.userAgent || "-"}</ElText>
                  )}
                </ElTableColumn>
              </ElTable>

              <div class="flex justify-end pt-3">
                <ElPagination
                  background
                  total={total.value}
                  pageSizes={[10, 20, 50, 100, 200]}
                  layout="total, sizes, prev, pager, next, jumper"
                  v-model:current-page={currentPage.value}
                  v-model:page-size={pageSize.value}
                  onCurrent-change={handleCurrentPageChange}
                  onSize-change={handlePageSizeChange}
                />
              </div>
            </>
          ),
        }}
      </ElCard>
    )
  },
})
