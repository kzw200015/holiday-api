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

import { listCodexAccounts, type Account, updateCodexAccount } from "@/api/codexApi.ts"

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
                <ElTable data={accounts.value} class="w-full" stripe>
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
