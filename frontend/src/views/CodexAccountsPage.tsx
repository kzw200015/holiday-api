import { computed, defineComponent, onMounted, reactive, ref } from "vue"
import dayjs from "dayjs"
import { DocumentCopy, Link, RefreshRight } from "@element-plus/icons-vue"
import {
  ElButton,
  ElCard,
  ElDialog,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElMessage,
  ElPagination,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
  ElText,
  type FormInstance,
  type FormRules,
} from "element-plus"

import {
  type Account,
  completeCodexOAuth,
  createCodexOAuthSession,
  getCodexTodayTokenUsage,
  listCodexAccounts,
  listCodexResponseLogs,
  type OAuthSessionInfo,
  type ResponseLogItem,
  type TodayTokenUsage,
  updateCodexAccount,
} from "@/api/codexApi.ts"

// formatDateTime 用于统一展示后端返回的时间字段。
function formatDateTime(value: string) {
  return dayjs(value).format("YYYY-MM-DD HH:mm:ss")
}

function maskToken(token: string) {
  const trimmed = (token || "").trim()
  if (trimmed === "") {
    return "-"
  }
  if (trimmed.length <= 12) {
    return trimmed
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
}

function formatRate(rate: number) {
  return `${(rate * 100).toFixed(2)}%`
}

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

async function copyToClipboard(text: string) {
  const content = (text || "").trim()
  if (!content) {
    ElMessage.warning("没有可复制的内容")
    return
  }

  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success("已复制")
  } catch {
    ElMessage.error("复制失败，请手动复制")
  }
}

export default defineComponent({
  name: "CodexAccountsPage",
  setup() {
    const loading = ref(false)
    const accounts = ref<Account[]>([])
    const total = ref(0)

    const currentPage = ref(1)
    const pageSize = ref(10)

    const logsLoading = ref(false)
    const logs = ref<ResponseLogItem[]>([])
    const logsTotal = ref(0)
    const logsCurrentPage = ref(1)
    const logsPageSize = ref(10)
    const todayTokenUsageLoading = ref(false)
    const todayTokenUsage = ref<TodayTokenUsage>({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
    })

    const sessionLoading = ref(false)
    const session = ref<OAuthSessionInfo | null>(null)

    const accountName = ref("")
    const callbackUrl = ref("")
    const completeLoading = ref(false)

    const editDialogVisible = ref(false)
    const editFormRef = ref<FormInstance>()
    const editingAccountId = ref<number | null>(null)
    const togglingAccountId = ref<number | null>(null)
    const editForm = reactive({
      name: "",
      enabled: true,
    })
    const editLoading = ref(false)

    const editRules: FormRules = {
      name: [{ required: true, message: "请输入账户名称", trigger: "blur" }],
    }

    const refreshAccounts = async () => {
      loading.value = true
      try {
        const page = await listCodexAccounts(currentPage.value, pageSize.value)
        accounts.value = page.items
        total.value = page.total
      } finally {
        loading.value = false
      }
    }

    const refreshLogs = async () => {
      logsLoading.value = true
      try {
        const page = await listCodexResponseLogs(logsCurrentPage.value, logsPageSize.value)
        logs.value = page.items
        logsTotal.value = page.total
      } finally {
        logsLoading.value = false
      }
    }

    const refreshTodayTokenUsage = async () => {
      todayTokenUsageLoading.value = true
      try {
        todayTokenUsage.value = await getCodexTodayTokenUsage()
      } finally {
        todayTokenUsageLoading.value = false
      }
    }

    const createSession = async () => {
      sessionLoading.value = true
      try {
        session.value = await createCodexOAuthSession()
      } finally {
        sessionLoading.value = false
      }
    }

    const completeOAuth = async () => {
      completeLoading.value = true
      try {
        await completeCodexOAuth(accountName.value, callbackUrl.value)
        accountName.value = ""
        callbackUrl.value = ""
        currentPage.value = 1
        await refreshAccounts()
        ElMessage.success("已添加 Codex 账户")
      } finally {
        completeLoading.value = false
      }
    }

    onMounted(() => {
      void refreshAccounts()
      void refreshLogs()
      void refreshTodayTokenUsage()
    })

    const sessionLinkText = computed(() => session.value?.url || "")
    const sessionStateText = computed(() => session.value?.state || "-")
    const sessionExpiresAtText = computed(() => {
      if (!session.value) {
        return "-"
      }
      return formatDateTime(session.value.expiresAt)
    })
    const canCompleteOAuth = computed(() => accountName.value.trim() !== "" && callbackUrl.value.trim() !== "")

    const openEditDialog = (account: Account) => {
      editingAccountId.value = account.id
      editForm.name = account.name
      editForm.enabled = account.enabled
      editDialogVisible.value = true
    }

    const closeEditDialog = () => {
      editDialogVisible.value = false
      editingAccountId.value = null
      editForm.name = ""
      editForm.enabled = true
    }

    const saveEdit = async () => {
      try {
        await (editFormRef.value as FormInstance).validate()
      } catch {
        return
      }

      editLoading.value = true
      try {
        if (editingAccountId.value === null) {
          return
        }
        await updateCodexAccount(editingAccountId.value, {
          name: editForm.name,
          enabled: editForm.enabled,
        })
        await refreshAccounts()
        ElMessage.success("已更新名称")
        closeEditDialog()
      } finally {
        editLoading.value = false
      }
    }

    const toggleAccountEnabled = async (account: Account, enabled: boolean) => {
      if (account.enabled === enabled) {
        return
      }
      const previousEnabled = account.enabled
      account.enabled = enabled
      togglingAccountId.value = account.id
      try {
        await updateCodexAccount(account.id, {
          name: account.name,
          enabled,
        })
        ElMessage.success(enabled ? "已启用账户" : "已禁用账户")
      } catch {
        account.enabled = previousEnabled
      } finally {
        togglingAccountId.value = null
      }
    }

    const handleCurrentPageChange = (page: number) => {
      currentPage.value = Number(page || 1)
      void refreshAccounts()
    }

    const handlePageSizeChange = (size: number) => {
      pageSize.value = Number(size || 10)
      currentPage.value = 1
      void refreshAccounts()
    }

    const handleLogsCurrentPageChange = (page: number) => {
      logsCurrentPage.value = Number(page || 1)
      void refreshLogs()
    }

    const handleLogsPageSizeChange = (size: number) => {
      logsPageSize.value = Number(size || 10)
      logsCurrentPage.value = 1
      void refreshLogs()
    }

    return () => (
      <section>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <ElText class="m-0 text-2xl font-semibold tracking-tight">Codex 账户</ElText>
              <ElTag type="info">OAuth</ElTag>
            </div>
            <ElText class="text-[var(--el-text-color-secondary)]">
              获取授权链接完成登录后，把浏览器地址栏的回调 URL 粘贴到下方输入框提交，即可添加账户。
            </ElText>
          </div>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div class="md:col-span-2">
              <ElCard class="rounded-xl" shadow="never">
                {{
                  header: () => (
                    <div class="flex items-center justify-between gap-3">
                      <ElText class="font-semibold">今日 Token 统计</ElText>
                      <ElButton
                        icon={RefreshRight}
                        loading={todayTokenUsageLoading.value}
                        onClick={() => void refreshTodayTokenUsage()}
                      >
                        刷新
                      </ElButton>
                    </div>
                  ),
                  default: () => (
                    <div
                      class="rounded-2xl border border-[var(--el-border-color-lighter)] bg-[var(--el-fill-color-blank)] p-5">
                      <div class="overflow-x-auto">
                        <div
                          class="mx-auto grid min-w-[700px] justify-center gap-x-4 gap-y-2 md:gap-x-6"
                          style={{ gridTemplateColumns: "minmax(200px,auto) auto minmax(150px,auto) auto minmax(180px,auto)" }}
                        >
                          <ElText
                            class="text-center text-[11px] tracking-[0.14em] text-[var(--el-text-color-secondary)]">
                            输入
                          </ElText>
                          <div/>
                          <ElText
                            class="text-center text-[11px] tracking-[0.14em] text-[var(--el-text-color-secondary)]">
                            输出
                          </ElText>
                          <div/>
                          <ElText class="text-center text-[11px] tracking-[0.14em] text-[var(--el-color-primary)]">
                            总量
                          </ElText>

                          <ElText class="text-center text-4xl font-semibold leading-none tabular-nums">
                            {formatCompactTokenCount(todayTokenUsage.value.inputTokens)}
                          </ElText>
                          <ElText
                            class="text-center text-3xl font-semibold leading-none text-[var(--el-text-color-secondary)] md:text-4xl">
                            +
                          </ElText>
                          <ElText class="text-center text-4xl font-semibold leading-none tabular-nums">
                            {formatCompactTokenCount(todayTokenUsage.value.outputTokens)}
                          </ElText>
                          <ElText
                            class="text-center text-3xl font-semibold leading-none text-[var(--el-text-color-secondary)] md:text-4xl">
                            =
                          </ElText>
                          <div class=" px-4 py-2 text-center">
                            <ElText
                              class="text-4xl font-semibold leading-none text-[var(--el-color-primary)] tabular-nums">
                              {formatCompactTokenCount(todayTokenUsage.value.totalTokens)}
                            </ElText>
                          </div>

                          <ElText
                            class="justify-self-center rounded-full bg-[var(--el-fill-color-light)] px-2.5 py-1 text-xs text-[var(--el-text-color-secondary)]">
                            缓存输入 {formatCompactTokenCount(todayTokenUsage.value.cachedInputTokens)}
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
            </div>

            <div>
              <ElCard class="h-full rounded-xl text-left" shadow="never">
                {{
                  header: () => (
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2">
                        <ElIcon>
                          <Link/>
                        </ElIcon>
                        <ElText class="font-semibold">获取 OAuth 链接</ElText>
                      </div>
                      <ElButton
                        type="primary"
                        loading={sessionLoading.value}
                        onClick={() => void createSession()}
                      >
                        {sessionLoading.value ? "生成中..." : "获取链接"}
                      </ElButton>
                    </div>
                  ),
                  default: () => (
                    <div class="flex w-full flex-col items-start gap-3">
                      <div class="flex w-full flex-col items-start gap-2">
                        <ElText
                          class="self-start text-xs text-[var(--el-text-color-secondary)]">
                          授权链接
                        </ElText>
                        <div class="w-full">
                          <ElInput
                            modelValue={sessionLinkText.value}
                            readonly
                            placeholder="点击右上角获取链接"
                            class="w-full"
                          />
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                          <ElButton
                            icon={DocumentCopy}
                            disabled={!session.value}
                            onClick={() => void copyToClipboard(sessionLinkText.value)}
                          >
                            复制链接
                          </ElButton>
                          <ElButton
                            type="success"
                            plain
                            disabled={!session.value}
                            onClick={() => {
                              const url = sessionLinkText.value
                              if (!url) {
                                return
                              }
                              window.open(url, "_blank")
                            }}
                          >
                            打开链接
                          </ElButton>
                        </div>
                      </div>

                      <div class="flex flex-col items-start gap-1">
                        <ElText class="text-xs text-[var(--el-text-color-secondary)]">
                          state：{sessionStateText.value}
                        </ElText>
                        <ElText class="text-xs text-[var(--el-text-color-secondary)]">
                          过期时间：{sessionExpiresAtText.value}
                        </ElText>
                      </div>
                    </div>
                  ),
                }}
              </ElCard>
            </div>

            <div>
              <ElCard class="h-full rounded-xl text-left" shadow="never">
                {{
                  header: () => (
                    <div class="flex items-center justify-between gap-3">
                      <ElText class="font-semibold">粘贴回调并添加</ElText>
                      <ElButton
                        type="primary"
                        loading={completeLoading.value}
                        disabled={!canCompleteOAuth.value}
                        onClick={() => void completeOAuth()}
                      >
                        {completeLoading.value ? "提交中..." : "提交"}
                      </ElButton>
                    </div>
                  ),
                  default: () => (
                    <div class="flex w-full flex-col items-start gap-2">
                      <div class="w-full">
                        <ElInput
                          placeholder="请输入账户名称（必填）"
                          v-model={accountName.value}
                          class="w-full"
                        />
                      </div>
                      <div class="w-full">
                        <ElInput
                          type="textarea"
                          autosize={{ minRows: 3, maxRows: 6 }}
                          placeholder="粘贴 http://localhost:1455/auth/callback?..."
                          v-model={callbackUrl.value}
                          class="w-full"
                        />
                      </div>
                      <ElText class="self-start text-xs text-[var(--el-text-color-secondary)]">
                        提示：回调地址通常打不开是正常的，复制地址栏即可。
                      </ElText>
                    </div>
                  ),
                }}
              </ElCard>
            </div>

            <div class="md:col-span-2">
              <ElCard class="rounded-xl" shadow="never">
                {{
                  header: () => (
                    <div class="flex items-center justify-between gap-3">
                      <ElText class="font-semibold">已添加账户</ElText>
                      <ElButton
                        icon={RefreshRight}
                        loading={loading.value}
                        onClick={() => void refreshAccounts()}
                      >
                        刷新
                      </ElButton>
                    </div>
                  ),
                  default: () => (
                    <>
                      <ElTable data={accounts.value} class="w-full" stripe>
                        <ElTableColumn prop="name" label="名称" minWidth={220}/>
                        <ElTableColumn label="Token" minWidth={240}>
                          {{
                            default: (scope: { row: Account }) => (
                              <div class="flex items-center gap-2">
                                <ElText class="font-mono text-sm">
                                  {maskToken(scope.row.token)}
                                </ElText>
                                <ElButton
                                  size="small"
                                  text
                                  icon={DocumentCopy}
                                  onClick={() => void copyToClipboard(scope.row.token)}
                                />
                              </div>
                            ),
                          }}
                        </ElTableColumn>
                        <ElTableColumn label="过期时间" minWidth={200}>
                          {{
                            default: (scope: { row: Account }) => (
                              <ElText
                                class="text-sm">{formatDateTime(scope.row.expiresAt)}</ElText>
                            ),
                          }}
                        </ElTableColumn>
                        <ElTableColumn label="更新时间" minWidth={200}>
                          {{
                            default: (scope: { row: Account }) => (
                              <ElText
                                class="text-sm">{formatDateTime(scope.row.updatedAt)}</ElText>
                            ),
                          }}
                        </ElTableColumn>
                        <ElTableColumn label="启用" width={110} align="center">
                          {{
                            default: (scope: { row: Account }) => (
                              <ElSwitch
                                modelValue={scope.row.enabled}
                                loading={togglingAccountId.value === scope.row.id}
                                onChange={(value: string | number | boolean) => void toggleAccountEnabled(scope.row, Boolean(value))}
                              />
                            ),
                          }}
                        </ElTableColumn>
                        <ElTableColumn label="操作" width={120} align="right">
                          {{
                            default: (scope: { row: Account }) => (
                              <ElButton
                                size="small"
                                type="primary"
                                plain
                                onClick={() => openEditDialog(scope.row)}
                              >
                                编辑
                              </ElButton>
                            ),
                          }}
                        </ElTableColumn>
                      </ElTable>

                      <div class="flex justify-end pt-3">
                        <ElPagination
                          background
                          total={total.value}
                          pageSizes={[10, 20, 50, 100]}
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
            </div>

            <div class="md:col-span-2">
              <ElCard class="rounded-xl" shadow="never">
                {{
                  header: () => (
                    <div class="flex items-center justify-between gap-3">
                      <ElText class="font-semibold">调用日志</ElText>
                      <ElButton
                        icon={RefreshRight}
                        loading={logsLoading.value}
                        onClick={() => void refreshLogs()}
                      >
                        刷新
                      </ElButton>
                    </div>
                  ),
                  default: () => (
                    <>
                      <ElTable data={logs.value} class="w-full" stripe
                               v-loading={logsLoading.value}>
                        <ElTableColumn label="时间" minWidth={180}>
                          {{
                            default: (scope: { row: ResponseLogItem }) => (
                              <ElText>{formatDateTime(scope.row.createdAt)}</ElText>
                            ),
                          }}
                        </ElTableColumn>
                        <ElTableColumn prop="accountName" label="账户" minWidth={160}/>
                        <ElTableColumn label="调用方式" width={110}>
                          {{
                            default: (scope: { row: ResponseLogItem }) => (
                              <ElTag type={scope.row.isSse ? "success" : "info"}>
                                {scope.row.isSse ? "SSE" : "HTTP"}
                              </ElTag>
                            ),
                          }}
                        </ElTableColumn>
                        <ElTableColumn prop="clientIp" label="IP" minWidth={140}/>
                        <ElTableColumn prop="inputTokens" label="输入Token" width={120}/>
                        <ElTableColumn prop="cachedInputTokens" label="缓存输入Token"
                                       width={130}/>
                        <ElTableColumn prop="outputTokens" label="输出Token" width={110}/>
                        <ElTableColumn label="缓存率" width={110}>
                          {{
                            default: (scope: { row: ResponseLogItem }) => (
                              <ElText>{formatRate(scope.row.cacheRate)}</ElText>
                            ),
                          }}
                        </ElTableColumn>
                        <ElTableColumn label="响应时间(ms)" width={120}>
                          {{
                            default: (scope: { row: ResponseLogItem }) => (
                              <ElText>{scope.row.durationMs}</ElText>
                            ),
                          }}
                        </ElTableColumn>
                        <ElTableColumn label="UA" minWidth={320}>
                          {{
                            default: (scope: { row: ResponseLogItem }) => (
                              <ElText
                                class="break-all">{scope.row.userAgent || "-"}</ElText>
                            ),
                          }}
                        </ElTableColumn>
                      </ElTable>

                      <div class="flex justify-end pt-3">
                        <ElPagination
                          background
                          total={logsTotal.value}
                          pageSizes={[10, 20, 50, 100, 200]}
                          layout="total, sizes, prev, pager, next, jumper"
                          v-model:current-page={logsCurrentPage.value}
                          v-model:page-size={logsPageSize.value}
                          onCurrent-change={handleLogsCurrentPageChange}
                          onSize-change={handleLogsPageSizeChange}
                        />
                      </div>
                    </>
                  ),
                }}
              </ElCard>
            </div>
          </div>

          <ElDialog
            title="编辑账户"
            modelValue={editDialogVisible.value}
            onUpdate:modelValue={(value: boolean) => {
              if (!value) {
                closeEditDialog()
                return
              }
              editDialogVisible.value = value
            }}
            width="420px"
            destroyOnClose
          >
            {{
              default: () => (
                <ElForm ref={editFormRef} model={editForm} rules={editRules} labelPosition="top">
                  <ElFormItem label="账户名称" prop="name">
                    <ElInput
                      placeholder="请输入账户名称"
                      modelValue={editForm.name}
                      onUpdate:modelValue={(value: string) => {
                        editForm.name = value
                      }}
                    />
                  </ElFormItem>
                </ElForm>
              ),
              footer: () => (
                <div class="flex justify-end">
                  <div class="flex items-center gap-2">
                    <ElButton disabled={editLoading.value} onClick={() => closeEditDialog()}>
                      取消
                    </ElButton>
                    <ElButton
                      type="primary"
                      loading={editLoading.value}
                      onClick={() => void saveEdit()}
                    >
                      保存
                    </ElButton>
                  </div>
                </div>
              ),
            }}
          </ElDialog>
        </div>
      </section>
    )
  },
})
