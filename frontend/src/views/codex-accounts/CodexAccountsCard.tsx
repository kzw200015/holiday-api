import { computed, defineComponent, onMounted, reactive, ref } from "vue"
import { CirclePlus, Delete, DocumentCopy, EditPen, RefreshRight } from "@element-plus/icons-vue"
import {
  ElButton,
  ElCard,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElPagination,
  ElPopconfirm,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElText,
  type FormInstance,
  type FormRules,
} from "element-plus"

import {
  deleteCodexAccount,
  listCodexAccounts,
  type Account,
  type CodexAccountQuota,
  updateCodexAccount,
} from "@/api/codexApi.ts"
import { useAppStore } from "@/stores/AppStore"
import CodexOAuthSection from "@/views/codex-accounts/CodexOAuthSection.tsx"
import { copyToClipboard, formatDateTime } from "@/views/codex-accounts/utils.ts"

const FIVE_HOUR_WINDOW_SECONDS = 18_000
const SEVEN_DAY_WINDOW_SECONDS = 604_800

type SimpleQuotaWindow = {
  remainingPercent: number | null
  resetAfterSeconds: number | null
}

function maskToken(token: string) {
  if (token === "") {
    return "-"
  }
  if (token.length <= 12) {
    return token
  }
  return `${token.slice(0, 6)}...${token.slice(-4)}`
}

function resolveRemainingPercent(usedPercent: number | null) {
  return usedPercent === null ? null : Math.max(0, Math.min(100, 100 - usedPercent))
}

function resolveSimpleWindows(quota: CodexAccountQuota) {
  const rateLimit = quota.rateLimit
  if (!rateLimit) {
    return { fiveHour: null, sevenDay: null }
  }

  const primary = rateLimit.primaryWindow
  const secondary = rateLimit.secondaryWindow
  const primarySeconds = primary?.limitWindowSeconds
  const secondarySeconds = secondary?.limitWindowSeconds

  if (primarySeconds === FIVE_HOUR_WINDOW_SECONDS || secondarySeconds === SEVEN_DAY_WINDOW_SECONDS) {
    return {
      fiveHour: primary,
      sevenDay: secondary,
    }
  }

  if (primarySeconds === SEVEN_DAY_WINDOW_SECONDS || secondarySeconds === FIVE_HOUR_WINDOW_SECONDS) {
    return {
      fiveHour: secondary,
      sevenDay: primary,
    }
  }

  return {
    fiveHour: primary,
    sevenDay: secondary,
  }
}

function toSimpleQuotaWindow(window: {
  usedPercent: number | null
  resetAfterSeconds: number | null
} | null): SimpleQuotaWindow {
  if (!window) {
    return {
      remainingPercent: null,
      resetAfterSeconds: null,
    }
  }
  return {
    remainingPercent: resolveRemainingPercent(window.usedPercent),
    resetAfterSeconds: window.resetAfterSeconds,
  }
}

function formatCompactReset(resetAfterSeconds: number | null) {
  if (resetAfterSeconds === null) {
    return "-"
  }
  if (resetAfterSeconds <= 0) {
    return "0m"
  }
  const day = Math.floor(resetAfterSeconds / 86400)
  const hour = Math.floor((resetAfterSeconds % 86400) / 3600)
  const minute = Math.floor((resetAfterSeconds % 3600) / 60)
  if (day > 0) {
    return `${day}d ${hour}h`
  }
  if (hour > 0) {
    return `${hour}h ${minute}m`
  }
  if (minute > 0) {
    return `${minute}m`
  }
  return "<1m"
}

function renderSimpleQuotaRow(label: "5h" | "7d", window: SimpleQuotaWindow) {
  const remainingPercent = window.remainingPercent
  const barWidth = remainingPercent === null ? 0 : Math.round(remainingPercent)
  const percentText = remainingPercent === null ? "-" : `${Math.round(remainingPercent)}%`
  const resetText = formatCompactReset(window.resetAfterSeconds)
  const badgeClass =
    label === "5h"
      ? "rounded-lg bg-[#e7ecff] px-2 py-1 text-xs font-semibold text-[#3f5bd8]"
      : "rounded-lg bg-[#daf3e8] px-2 py-1 text-xs font-semibold text-[#2f8a60]"

  return (
    <div class="flex items-center gap-2">
      <span class={badgeClass}>{label}</span>
      <div class="h-2 w-20 shrink-0 overflow-hidden rounded bg-[var(--el-fill-color-dark)]">
        <div class="h-full rounded bg-[#4caf6f]" style={{ width: `${barWidth}%` }}/>
      </div>
      <ElText class="text-xs font-semibold tabular-nums text-[var(--el-text-color-primary)]">{percentText}</ElText>
      <ElText class="whitespace-nowrap text-xs tabular-nums text-[var(--el-text-color-secondary)]">{resetText}</ElText>
    </div>
  )
}

function renderQuotaContent(quota: CodexAccountQuota | null) {
  if (!quota) {
    return <ElText class="text-sm text-[var(--el-text-color-secondary)]">-</ElText>
  }
  const windows = resolveSimpleWindows(quota)
  const fiveHour = toSimpleQuotaWindow(windows.fiveHour)
  const sevenDay = toSimpleQuotaWindow(windows.sevenDay)
  return (
    <div class="flex flex-col gap-2 py-1">
      {renderSimpleQuotaRow("5h", fiveHour)}
      {renderSimpleQuotaRow("7d", sevenDay)}
    </div>
  )
}

export default defineComponent({
  name: "CodexAccountsCard",
  setup() {
    const appStore = useAppStore()
    const loading = ref(false)
    const accounts = ref<Account[]>([])
    const total = ref(0)
    const currentPage = ref(1)
    const pageSize = ref(10)
    const togglingAccountId = ref<number | null>(null)
    const deletingAccountId = ref<number | null>(null)
    const oauthDrawerVisible = ref(false)

    const editDrawerVisible = ref(false)
    const editFormRef = ref<FormInstance>()
    const editingAccount = ref<Account | null>(null)
    const editForm = reactive({
      name: "",
    })
    const editLoading = ref(false)
    const rightFixed = computed(() => (appStore.isMobile ? undefined : "right"))

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

    onMounted(() => {
      void refreshAccounts()
    })

    const openEditDrawer = (account: Account) => {
      editingAccount.value = account
      editForm.name = account.name
      editDrawerVisible.value = true
    }

    const resetEditDrawerState = () => {
      editingAccount.value = null
      editForm.name = ""
    }

    const closeEditDrawer = () => {
      editDrawerVisible.value = false
      resetEditDrawerState()
    }

    const saveEdit = async () => {
      const formInstance = editFormRef.value
      if (!formInstance) {
        return
      }

      try {
        await formInstance.validate()
      } catch {
        return
      }

      const account = editingAccount.value
      if (!account) {
        return
      }

      editLoading.value = true
      try {
        await updateCodexAccount(account.id, {
          name: editForm.name,
          enabled: account.enabled,
        })
        await refreshAccounts()
        ElMessage.success("已更新名称")
        closeEditDrawer()
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

    const deleteAccount = async (account: Account) => {
      deletingAccountId.value = account.id
      try {
        await deleteCodexAccount(account.id)
        if (accounts.value.length === 1 && currentPage.value > 1) {
          // 删除当前页最后一条时，回到上一页避免出现空页。
          currentPage.value -= 1
        }
        await refreshAccounts()
        ElMessage.success("已删除账户")
      } finally {
        deletingAccountId.value = null
      }
    }

    const handleCurrentPageChange = (page: number) => {
      currentPage.value = page
      void refreshAccounts()
    }

    const handlePageSizeChange = (size: number) => {
      pageSize.value = size
      currentPage.value = 1
      void refreshAccounts()
    }

    return () => (
      <>
        <ElCard class="rounded-xl" shadow="never">
          {{
            header: () => (
              <div class="flex items-center justify-between gap-3">
                <ElText class="font-semibold">已添加账户</ElText>
                <div class="flex items-center gap-2">
                  <ElButton
                    type="primary"
                    icon={CirclePlus}
                    onClick={() => {
                      oauthDrawerVisible.value = true
                    }}
                  >
                    添加账户
                  </ElButton>
                  <ElButton
                    icon={RefreshRight}
                    loading={loading.value}
                    onClick={() => {
                      void refreshAccounts()
                    }}
                  >
                    刷新
                  </ElButton>
                </div>
              </div>
            ),
            default: () => (
              <>
                <ElTable data={accounts.value} class="w-full" stripe v-loading={loading.value}>
                  <ElTableColumn prop="name" label="名称" minWidth={220}/>
                  <ElTableColumn label="Token" minWidth={240}>
                    {(scope: { row: Account }) => (
                      <div class="flex items-center gap-2">
                        <ElText class="font-mono text-sm">{maskToken(scope.row.token)}</ElText>
                        <ElButton
                          size="small"
                          text
                          icon={DocumentCopy}
                          onClick={() => {
                            void copyToClipboard(scope.row.token)
                          }}
                        />
                      </div>
                    )}
                  </ElTableColumn>
                  <ElTableColumn label="过期时间" minWidth={200}>
                    {(scope: { row: Account }) => (
                      <ElText class="text-sm">{formatDateTime(scope.row.expiresAt)}</ElText>
                    )}
                  </ElTableColumn>
                  <ElTableColumn label="配额" minWidth={220} fixed={rightFixed.value}>
                    {(scope: { row: Account }) => renderQuotaContent(scope.row.quota)}
                  </ElTableColumn>
                  <ElTableColumn label="启用" width={110} align="center" fixed={rightFixed.value}>
                    {(scope: { row: Account }) => (
                      <ElSwitch
                        modelValue={scope.row.enabled}
                        loading={togglingAccountId.value === scope.row.id}
                        onChange={(value: string | number | boolean) => {
                          void toggleAccountEnabled(scope.row, Boolean(value))
                        }}
                      />
                    )}
                  </ElTableColumn>
                  <ElTableColumn label="操作" width={220} align="right" fixed={rightFixed.value}>
                    {(scope: { row: Account }) => (
                      <div class="flex justify-end gap-2">
                        <ElButton
                          size="small"
                          type="primary"
                          icon={EditPen}
                          onClick={() => {
                            openEditDrawer(scope.row)
                          }}
                        >
                          编辑
                        </ElButton>
                        <ElPopconfirm
                          title={`确认删除账户「${scope.row.name}」吗？`}
                          confirmButtonText="删除"
                          cancelButtonText="取消"
                          onConfirm={() => {
                            void deleteAccount(scope.row)
                          }}
                        >
                          {{
                            reference: () => (
                              <ElButton
                                size="small"
                                type="danger"
                                icon={Delete}
                                loading={deletingAccountId.value === scope.row.id}
                                disabled={deletingAccountId.value !== null && deletingAccountId.value !== scope.row.id}
                              >
                                删除
                              </ElButton>
                            ),
                          }}
                        </ElPopconfirm>
                      </div>
                    )}
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

        <CodexOAuthSection
          modelValue={oauthDrawerVisible.value}
          onUpdate:modelValue={(value: boolean) => {
            oauthDrawerVisible.value = value
          }}
          onAccountAdded={() => {
            void refreshAccounts()
          }}
        />

        <ElDrawer
          title="编辑账户"
          size="420px"
          destroyOnClose
          v-model={editDrawerVisible.value}
          onClosed={resetEditDrawerState}
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
              <div class="flex items-center justify-end gap-2">
                <ElButton disabled={editLoading.value} onClick={closeEditDrawer}>
                  取消
                </ElButton>
                <ElButton
                  type="primary"
                  loading={editLoading.value}
                  onClick={() => {
                    void saveEdit()
                  }}
                >
                  保存
                </ElButton>
              </div>
            ),
          }}
        </ElDrawer>
      </>
    )
  },
})
