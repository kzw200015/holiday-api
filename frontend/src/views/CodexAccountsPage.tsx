import { computed, defineComponent, onMounted, ref } from "vue"
import { DocumentCopy, Link, RefreshRight } from "@element-plus/icons-vue"
import {
    ElButton,
    ElCard,
    ElCol,
    ElIcon,
    ElInput,
    ElRow,
    ElTable,
    ElTableColumn,
    ElTag,
    ElText,
    ElMessage,
} from "element-plus"

import {
    completeCodexOAuth,
    createCodexOAuthSession,
    listCodexAccounts,
    type CodexAccount,
    type CodexOAuthSession,
} from "@/api/CodexApi"

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

        const sessionLoading = ref(false)
        const session = ref<CodexOAuthSession | null>(null)

        const callbackUrl = ref("")
        const completeLoading = ref(false)

        const refreshAccounts = async () => {
            loading.value = true
            try {
                accounts.value = await listCodexAccounts()
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
                await completeCodexOAuth(callbackUrl.value)
                callbackUrl.value = ""
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
        const sessionExpiresAtText = computed(() => session.value?.expiresAt || "-")

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
                                            disabled={!callbackUrl.value.trim()}
                                            onClick={() => void completeOAuth()}
                                        >
                                            {completeLoading.value ? "提交中..." : "提交"}
                                        </ElButton>
                                    </div>
                                ),
                                default: () => (
                                    <div class="grid gap-2">
                                        <ElInput
                                            type="textarea"
                                            autosize={{ minRows: 3, maxRows: 6 }}
                                            placeholder="粘贴 http://localhost:1455/auth/callback?..."
                                            modelValue={callbackUrl.value}
                                            onUpdate:modelValue={(v) => {
                                                callbackUrl.value = String(v || "")
                                            }}
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
                                    <ElTable data={accounts.value} class="w-full" stripe>
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
                                        <ElTableColumn prop="expiresAt" label="过期时间" minWidth={200}/>
                                        <ElTableColumn prop="updatedAt" label="更新时间" minWidth={200}/>
                                    </ElTable>
                                ),
                            }}
                        </ElCard>
                    </ElCol>
                </ElRow>
            </section>
        )
    },
})
