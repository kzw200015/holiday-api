import { computed, defineComponent, ref } from "vue"
import dayjs from "dayjs"
import { DocumentCopy, Link } from "@element-plus/icons-vue"
import { ElButton, ElCard, ElDrawer, ElIcon, ElInput, ElMessage, ElText } from "element-plus"

import {
  completeCodexOAuth,
  createCodexOAuthSession,
  type OAuthSessionInfo,
} from "@/api/codexApi.ts"

function formatDateTime(value: string) {
  return dayjs(value).format("YYYY-MM-DD HH:mm:ss")
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
  name: "CodexOAuthSection",
  props: {
    modelValue: {
      type: Boolean,
      required: true,
    },
  },
  emits: {
    "update:modelValue": (_value: boolean) => true,
    accountAdded: () => true,
  },
  setup(props, { emit }) {
    const sessionLoading = ref(false)
    const session = ref<OAuthSessionInfo | null>(null)
    const accountName = ref("")
    const callbackUrl = ref("")
    const completeLoading = ref(false)

    const drawerVisible = computed({
      get: () => props.modelValue,
      set: (value: boolean) => {
        emit("update:modelValue", value)
      },
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
        drawerVisible.value = false
        ElMessage.success("已添加 Codex 账户")
        emit("accountAdded")
      } finally {
        completeLoading.value = false
      }
    }

    return () => (
      <ElDrawer
        title="Codex OAuth 授权"
        size="560px"
        modelValue={drawerVisible.value}
        onUpdate:modelValue={(value: boolean) => {
          drawerVisible.value = value
        }}
      >
        {{
          default: () => (
            <div class="flex flex-col gap-4">
              <ElCard class="rounded-xl text-left" shadow="never">
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
                        onClick={() => {
                          void createSession()
                        }}
                      >
                        {sessionLoading.value ? "生成中..." : "获取链接"}
                      </ElButton>
                    </div>
                  ),
                  default: () => (
                    <div class="flex w-full flex-col items-start gap-3">
                      <div class="flex w-full flex-col items-start gap-2">
                        <ElText class="self-start text-xs text-[var(--el-text-color-secondary)]">授权链接</ElText>
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
                            onClick={() => {
                              void copyToClipboard(sessionLinkText.value)
                            }}
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
                        <ElText class="text-xs text-[var(--el-text-color-secondary)]">state：{sessionStateText.value}</ElText>
                        <ElText class="text-xs text-[var(--el-text-color-secondary)]">过期时间：{sessionExpiresAtText.value}</ElText>
                      </div>
                    </div>
                  ),
                }}
              </ElCard>

              <ElCard class="rounded-xl text-left" shadow="never">
                {{
                  header: () => (
                    <div class="flex items-center justify-between gap-3">
                      <ElText class="font-semibold">粘贴回调并添加</ElText>
                      <ElButton
                        type="primary"
                        loading={completeLoading.value}
                        disabled={!canCompleteOAuth.value}
                        onClick={() => {
                          void completeOAuth()
                        }}
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
                          modelValue={accountName.value}
                          onUpdate:modelValue={(value: string) => {
                            accountName.value = value
                          }}
                          class="w-full"
                        />
                      </div>
                      <div class="w-full">
                        <ElInput
                          type="textarea"
                          autosize={{ minRows: 3, maxRows: 6 }}
                          placeholder="粘贴 http://localhost:1455/auth/callback?..."
                          modelValue={callbackUrl.value}
                          onUpdate:modelValue={(value: string) => {
                            callbackUrl.value = value
                          }}
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
          ),
        }}
      </ElDrawer>
    )
  },
})
