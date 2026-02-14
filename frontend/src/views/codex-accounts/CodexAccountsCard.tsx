import { defineComponent, onMounted, reactive, ref, watch } from "vue"
import dayjs from "dayjs"
import { DocumentCopy, RefreshRight } from "@element-plus/icons-vue"
import {
  ElButton,
  ElCard,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElPagination,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElText,
  type FormInstance,
  type FormRules,
} from "element-plus"

import { listCodexAccounts, type Account, type CodexAccountQuota, updateCodexAccount } from "@/api/codexApi.ts"

type SimpleQuotaWindow = {
  remainingPercent: number | null
  resetAfterSeconds: number | null
}

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

function resolveRemainingPercent(usedPercent: number | null) {
  if (usedPercent === null) {
    return null
  }
  const remaining = 100 - usedPercent
  if (remaining < 0) {
    return 0
  }
  if (remaining > 100) {
    return 100
  }
  return remaining
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

  if (primarySeconds === 18000 || secondarySeconds === 604800) {
    return {
      fiveHour: primary,
      sevenDay: secondary,
    }
  }
  if (primarySeconds === 604800 || secondarySeconds === 18000) {
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
      <div class="h-2 w-20 overflow-hidden rounded bg-[var(--el-fill-color-dark)]">
        <div class="h-full rounded bg-[#4caf6f]" style={{ width: `${barWidth}%` }}/>
      </div>
      <ElText class="text-xs font-semibold tabular-nums text-[var(--el-text-color-primary)]">{percentText}</ElText>
      <ElText class="text-xs tabular-nums text-[var(--el-text-color-secondary)]">{resetText}</ElText>
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
  props: {
    reloadVersion: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const loading = ref(false)
    const accounts = ref<Account[]>([])
    const total = ref(0)
    const currentPage = ref(1)
    const pageSize = ref(10)
    const togglingAccountId = ref<number | null>(null)

    const editDialogVisible = ref(false)
    const editFormRef = ref<FormInstance>()
    const editingAccountId = ref<number | null>(null)
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

    onMounted(() => {
      void refreshAccounts()
    })

    watch(
      () => props.reloadVersion,
      () => {
        currentPage.value = 1
        void refreshAccounts()
      },
    )

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
      const formInstance = editFormRef.value
      if (!formInstance) {
        return
      }

      try {
        await formInstance.validate()
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

    return () => (
      <>
        <ElCard class="rounded-xl" shadow="never">
          {{
            header: () => (
              <div class="flex items-center justify-between gap-3">
                <ElText class="font-semibold">已添加账户</ElText>
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
            ),
            default: () => (
              <>
                <ElTable data={accounts.value} class="w-full" stripe v-loading={loading.value}>
                  <ElTableColumn prop="name" label="名称" minWidth={220}/>
                  <ElTableColumn label="Token" minWidth={240}>
                    {{
                      default: (scope: { row: Account }) => (
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
                      ),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="过期时间" minWidth={200}>
                    {{
                      default: (scope: { row: Account }) => (
                        <ElText class="text-sm">{formatDateTime(scope.row.expiresAt)}</ElText>
                      ),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="更新时间" minWidth={200}>
                    {{
                      default: (scope: { row: Account }) => (
                        <ElText class="text-sm">{formatDateTime(scope.row.updatedAt)}</ElText>
                      ),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="配额" minWidth={220}>
                    {{
                      default: (scope: { row: Account }) => renderQuotaContent(scope.row.quota),
                    }}
                  </ElTableColumn>
                  <ElTableColumn label="启用" width={110} align="center">
                    {{
                      default: (scope: { row: Account }) => (
                        <ElSwitch
                          modelValue={scope.row.enabled}
                          loading={togglingAccountId.value === scope.row.id}
                          onChange={(value: string | number | boolean) => {
                            void toggleAccountEnabled(scope.row, Boolean(value))
                          }}
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
                          onClick={() => {
                            openEditDialog(scope.row)
                          }}
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
                  <ElButton disabled={editLoading.value} onClick={closeEditDialog}>
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
              </div>
            ),
          }}
        </ElDialog>
      </>
    )
  },
})
