import { computed, defineComponent, onMounted, ref } from "vue"
import dayjs from "dayjs"
import { DocumentCopy, Link, RefreshRight } from "@element-plus/icons-vue"
import {
  ElButton,
  ElCard,
  ElCol,
  ElDialog,
  ElIcon,
  ElInput,
  ElMessage,
  ElPagination,
  ElRow,
  ElTable,
  ElTableColumn,
  ElTag,
  ElText,
} from "element-plus"

import {
  type CodexAccount,
  type CodexOAuthSession,
  completeCodexOAuth,
  createCodexOAuthSession,
  listCodexAccounts,
  updateCodexAccount,
} from "@/api/CodexApi"

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
    const accounts = ref<CodexAccount[]>([])
    const total = ref(0)

    const currentPage = ref(1)
    const pageSize = ref(10)

    const sessionLoading = ref(false)
    const session = ref<CodexOAuthSession | null>(null)

    const accountName = ref("")
    const callbackUrl = ref("")
    const completeLoading = ref(false)

    const editDialogVisible = ref(false)
    const editingAccountId = ref("")
    const editingName = ref("")
    const editLoading = ref(false)

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
    const canSaveEdit = computed(() => editingAccountId.value !== "" && editingName.value.trim() !== "")

    const openEditDialog = (account: CodexAccount) => {
      editingAccountId.value = account.accountId
      editingName.value = account.name
      editDialogVisible.value = true
    }

    const closeEditDialog = () => {
      editDialogVisible.value = false
      editingAccountId.value = ""
      editingName.value = ""
    }

    const saveEdit = async () => {
      editLoading.value = true
      try {
        await updateCodexAccount(editingAccountId.value, { name: editingName.value })
        await refreshAccounts()
        ElMessage.success("已更新名称")
        closeEditDialog()
      } finally {
        editLoading.value = false
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

    return () => (
      <section class="grid gap-4">
        <div class="grid gap-2">
          <div class="flex items-center gap-2">
            <h1 class="m-0 text-2xl font-semibold tracking-tight">Codex 账户</h1>
            <ElTag type="info">OAuth</ElTag>
          </div>
          <ElText class="text-[var(--el-text-color-secondary)]">
            获取授权链接完成登录后，把浏览器地址栏的回调 URL 粘贴到下方输入框提交，即可添加账户。
          </ElText>
        </div>

        <ElRow gutter={16} class="gap-y-4">
          <ElCol xs={24} md={12}>
            <ElCard class="h-full rounded-xl" shadow="never">
              {{
                header: () => (
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 font-semibold">
                      <ElIcon>
                        <Link/>
                      </ElIcon>
                      <span>获取 OAuth 链接</span>
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
                  <div class="grid gap-3">
                    <div class="grid gap-2">
                      <ElText class="text-xs text-[var(--el-text-color-secondary)]">
                        授权链接
                      </ElText>
                      <ElInput
                        modelValue={sessionLinkText.value}
                        readonly
                        placeholder="点击右上角获取链接"
                      />
                      <div class="flex flex-wrap items-center gap-2">
                        <ElButton
                          disabled={!session.value}
                          onClick={() => void copyToClipboard(sessionLinkText.value)}
                        >
                          <ElIcon class="mr-1">
                            <DocumentCopy/>
                          </ElIcon>
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

                    <div class="grid gap-1">
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
          </ElCol>

          <ElCol xs={24} md={12}>
            <ElCard class="h-full rounded-xl" shadow="never">
              {{
                header: () => (
                  <div class="flex items-center justify-between gap-2">
                    <div class="font-semibold">粘贴回调并添加</div>
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
                  <div class="grid gap-2">
                    <ElInput
                      placeholder="请输入账户名称（必填）"
                      v-model={accountName.value}
                    />
                    <ElInput
                      type="textarea"
                      autosize={{ minRows: 3, maxRows: 6 }}
                      placeholder="粘贴 http://localhost:1455/auth/callback?..."
                      v-model={callbackUrl.value}
                    />
                    <ElText class="text-xs text-[var(--el-text-color-secondary)]">
                      提示：回调地址通常打不开是正常的，复制地址栏即可。
                    </ElText>
                  </div>
                ),
              }}
            </ElCard>
          </ElCol>

          <ElCol xs={24}>
            <ElCard class="rounded-xl" shadow="never">
              {{
                header: () => (
                  <div class="flex items-center justify-between gap-2">
                    <div class="font-semibold">已添加账户</div>
                    <ElButton
                      loading={loading.value}
                      onClick={() => void refreshAccounts()}
                    >
                      <ElIcon class="mr-1">
                        <RefreshRight/>
                      </ElIcon>
                      刷新
                    </ElButton>
                  </div>
                ),
                default: () => (
                  <>
                    <ElTable data={accounts.value} class="w-full" stripe>
                      <ElTableColumn prop="name" label="名称" minWidth={220}/>
                      <ElTableColumn prop="accountId" label="Account ID" minWidth={260}/>
                      <ElTableColumn label="Token" minWidth={240}>
                        {{
                          default: (scope: { row: CodexAccount }) => (
                            <div class="flex items-center gap-2">
                              <span class="font-mono text-sm">{maskToken(scope.row.token)}</span>
                              <ElButton
                                size="small"
                                text
                                onClick={() => void copyToClipboard(scope.row.token)}
                              >
                                <ElIcon>
                                  <DocumentCopy/>
                                </ElIcon>
                              </ElButton>
                            </div>
                          ),
                        }}
                      </ElTableColumn>
                      <ElTableColumn label="过期时间" minWidth={200}>
                        {{
                          default: (scope: { row: CodexAccount }) => (
                            <span class="font-mono text-sm">{formatDateTime(scope.row.expiresAt)}</span>
                          ),
                        }}
                      </ElTableColumn>
                      <ElTableColumn label="更新时间" minWidth={200}>
                        {{
                          default: (scope: { row: CodexAccount }) => (
                            <span class="font-mono text-sm">{formatDateTime(scope.row.updatedAt)}</span>
                          ),
                        }}
                      </ElTableColumn>
                      <ElTableColumn label="操作" width={120} align="right">
                        {{
                          default: (scope: { row: CodexAccount }) => (
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

                    <div class="flex flex-wrap items-center justify-end gap-3 pt-3">
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
          </ElCol>
        </ElRow>

        <ElDialog
          title="编辑账户名称"
          modelValue={editDialogVisible.value}
          onUpdate:modelValue={(value: boolean) => {
            if (!value) {
              closeEditDialog()
              return
            }
            editDialogVisible.value = value
          }}
          width="420px"
        >
          {{
            default: () => (
              <div class="grid gap-2">
                <ElInput
                  placeholder="请输入账户名称（必填）"
                  modelValue={editingName.value}
                  onUpdate:modelValue={(value: string) => {
                    editingName.value = value
                  }}
                />
              </div>
            ),
            footer: () => (
              <div class="flex items-center justify-end gap-2">
                <ElButton disabled={editLoading.value} onClick={() => closeEditDialog()}>
                  取消
                </ElButton>
                <ElButton
                  type="primary"
                  loading={editLoading.value}
                  disabled={!canSaveEdit.value}
                  onClick={() => void saveEdit()}
                >
                  保存
                </ElButton>
              </div>
            ),
          }}
        </ElDialog>
      </section>
    )
  },
})
