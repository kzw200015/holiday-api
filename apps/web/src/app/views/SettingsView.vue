<script setup lang="ts">
import { CircleCheckIcon, LogOutIcon, RefreshCwIcon } from "@lucide/vue"
import { onActivated, ref, useTemplateRef } from "vue"
import { useRouter } from "vue-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/features/auth/store"
import TagTranslationCard from "@/features/eh/components/TagTranslationCard.vue"
import { useEhCredential } from "@/features/eh/composables/useEhCredential"
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"
import FormField from "@/shared/components/FormField.vue"

const cookieFields = [
  { name: "ipbMemberId", label: "ipb_member_id", hint: "登录 e 站后必有" },
  { name: "ipbPassHash", label: "ipb_pass_hash", hint: "登录 e 站后必有" },
  { name: "igneous", label: "igneous", hint: "里站专用，没有就留空，留空则只能看表站" },
] as const
const router = useRouter()
const authStore = useAuthStore()
/* 绑定状态、进行中与失败提示都由这一处提供，页面只管显示和提交。 */
const { status, loading, loadError, saving, errorMessage, reload, bind, unbind: unbindCredential } = useEhCredential()
const tagTranslationCard = useTemplateRef("tagTranslationCard")
const form = ref({ ipbMemberId: "", ipbPassHash: "", igneous: "" })
const refreshing = ref(false)

/*
 * 重读绑定状态与译名状态：别处（另一台设备）换绑了 e 站账号、同步了译名，要靠这里拿到最新状态。
 * 表单里填到一半的内容不动。
 */
async function refresh() {
  refreshing.value = true
  try {
    await Promise.all([reload(), tagTranslationCard.value?.reload()])
  } finally {
    refreshing.value = false
  }
}

/* 页面被 KeepAlive 留着，每次回来都重读一次。首次挂载也会触发，那次各自已经在读，跳过。 */
let activated = false
onActivated(() => {
  if (activated) {
    void refresh()
  }
  activated = true
})
const successMessage = ref("")

/* 直接用这次提交回来的状态，不去读共享的那份，省得依赖「那边已经写完了」这个顺序。 */
async function submit() {
  successMessage.value = ""
  try {
    const bound = await bind({ ...form.value })
    successMessage.value = bound.hasExAccess
      ? "绑定成功，里站已解锁。"
      : "绑定成功。这个账号没有里站权限，只能浏览表站。"
    form.value = { ipbMemberId: "", ipbPassHash: "", igneous: "" }
  } catch {
    /* 失败原因已经在 errorMessage 里，这里只是别让它变成未处理的拒绝。 */
  }
}

async function unbind() {
  successMessage.value = ""
  await unbindCredential().catch(() => {})
}

async function signOut() {
  authStore.logout()
  await router.replace({ name: "login" })
}
</script>

<template>
  <div class="page-content page-content-form flex flex-col gap-4">
    <div class="flex justify-end">
      <Button variant="outline" size="sm" :disabled="refreshing" @click="refresh">
        <RefreshCwIcon />
        刷新
      </Button>
    </div>
    <Card>
      <CardHeader>
        <CardTitle>e 站账号</CardTitle>
        <CardDescription>
          不绑也能用：不绑定时匿名浏览表站，绑定后才能进里站，也才会用上你自己账号的过滤器设置。
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <template v-if="loading">
          <Skeleton class="h-5 w-40" />
          <Skeleton class="h-20 w-full" />
        </template>
        <ErrorAlert v-else-if="loadError" :message="loadError" title="状态加载失败" retryable @retry="reload" />
        <template v-else>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-muted-foreground">当前状态</span>
            <template v-if="status?.bound">
              <Badge>已绑定 {{ status.memberId }}</Badge>
              <Badge v-if="status.hasExAccess" variant="secondary">里站可用</Badge>
              <Badge v-else variant="outline">仅表站</Badge>
            </template>
            <Badge v-else variant="outline">{{ status ? "未绑定" : "状态未获取" }}</Badge>
          </div>
          <Alert v-if="successMessage">
            <CircleCheckIcon />
            <AlertTitle>已保存</AlertTitle>
            <AlertDescription>{{ successMessage }}</AlertDescription>
          </Alert>
          <ErrorAlert v-if="errorMessage" :message="errorMessage" title="操作失败" />
          <form class="flex flex-col gap-4" @submit.prevent="submit">
            <FormField
              v-for="field in cookieFields"
              :id="field.name"
              :key="field.name"
              v-model="form[field.name]"
              :label="field.label"
              label-class="font-mono"
              :placeholder="field.hint"
            />
            <div class="flex flex-wrap gap-2">
              <Button :disabled="saving" type="submit">{{ saving ? "校验中…" : "保存并校验" }}</Button>
              <!-- 解绑之后要重新去浏览器里抄三个 Cookie 才能绑回来，所以先确认。 -->
              <ConfirmDialog
                v-if="status?.bound"
                title="解绑 e 站账号？"
                description="解绑后回到匿名浏览表站，想再绑定需要重新复制这三个 Cookie。"
                confirm-text="解绑"
                @confirm="unbind"
              >
                <Button variant="destructive" :disabled="saving" type="button">解绑</Button>
              </ConfirmDialog>
            </div>
          </form>
        </template>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>怎么拿到这三个值</CardTitle>
        <CardDescription>
          服务端没法代你登录：e 站的登录接口挂在 Cloudflare 盾后面，只能你在浏览器里登录后把 Cookie 复制过来。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol class="text-muted-foreground flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          <li>在浏览器里登录 e-hentai.org，然后访问一次 exhentai.org（里站权限就是这一步拿到的）。</li>
          <li>按 F12 打开开发者工具，切到「应用 / Application」→「Cookie」。</li>
          <li>
            在 e-hentai.org 下找到 <code class="text-foreground">ipb_member_id</code> 和
            <code class="text-foreground">ipb_pass_hash</code>，在 exhentai.org 下找到
            <code class="text-foreground">igneous</code>。
          </li>
          <li>把三个值粘贴到上面，保存时会拿它们实际请求一次，无效不会存下来。</li>
        </ol>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>本站账号</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm">
          当前登录：<span class="font-medium">{{ authStore.user?.username ?? "-" }}</span>
        </span>
        <Button variant="outline" @click="signOut">
          <LogOutIcon />
          退出登录
        </Button>
      </CardContent>
    </Card>
    <TagTranslationCard ref="tagTranslationCard" />
  </div>
</template>
