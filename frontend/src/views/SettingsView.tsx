import { CircleCheckIcon, LogOutIcon } from "@lucide/vue"
import { defineComponent, ref } from "vue"
import { useRouter } from "vue-router"

import { bindCredential, fetchCredentialStatus, unbindCredential } from "@/api/eh"
import ErrorAlert from "@/components/ErrorAlert"
import FormField from "@/components/FormField"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useQuery } from "@/composables/useQuery"
import { useAuthStore } from "@/stores/AuthStore"

/* 三个 Cookie 的说明文案，name 与 e 站的 Cookie 名一致 */
const cookieFields = [
  { name: "ipbMemberId", label: "ipb_member_id", hint: "登录 e 站后必有" },
  { name: "ipbPassHash", label: "ipb_pass_hash", hint: "登录 e 站后必有" },
  { name: "igneous", label: "igneous", hint: "里站专用，没有就留空，留空则只能看前站" },
] as const

/* 设置页：绑定 e 站账号、查看本站账号 */
export default defineComponent({
  name: "SettingsView",
  setup() {
    const router = useRouter()
    const authStore = useAuthStore()

    /* 状态读取与其他页面的查询同源：加载态、报错与重试都由 useQuery 提供，
       绑定和解绑是用户动作，仍在下面各自处理。 */
    const {
      data: status,
      error: loadError,
      loading,
      retry,
    } = useQuery(
      () => null,
      (_params, signal) => fetchCredentialStatus(signal),
    )

    const form = ref({ ipbMemberId: "", ipbPassHash: "", igneous: "" })
    const errorMessage = ref("")
    const successMessage = ref("")
    const saving = ref(false)

    async function submit(event: Event) {
      event.preventDefault()
      saving.value = true
      errorMessage.value = ""
      successMessage.value = ""
      try {
        status.value = await bindCredential({ ...form.value })
        authStore.invalidateGalleries()
        successMessage.value = status.value.hasExAccess
          ? "绑定成功，里站已解锁。"
          : "绑定成功。这个账号没有里站权限，只能浏览前站。"
        form.value = { ipbMemberId: "", ipbPassHash: "", igneous: "" }
      } catch (error) {
        errorMessage.value = (error as Error).message
      } finally {
        saving.value = false
      }
    }

    async function unbind() {
      saving.value = true
      errorMessage.value = ""
      successMessage.value = ""
      try {
        await unbindCredential()
        authStore.invalidateGalleries()
        status.value = { bound: false, memberId: "", hasExAccess: false }
      } catch (error) {
        errorMessage.value = (error as Error).message
      } finally {
        saving.value = false
      }
    }

    async function signOut() {
      /* 退出登录只是丢掉本地令牌，没有后端往返 */
      authStore.logout()
      await router.replace({ name: "login" })
    }

    return () => (
      <div class="page-content page-content-form flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>e 站账号</CardTitle>
            <CardDescription>
              不绑也能用：不绑定时匿名浏览前站，绑定后才能进里站，也才会用上你自己账号的过滤器设置。
            </CardDescription>
          </CardHeader>

          <CardContent class="flex flex-col gap-4">
            {loading.value ? (
              <>
                <Skeleton class="h-5 w-40" />
                <Skeleton class="h-20 w-full" />
              </>
            ) : loadError.value ? (
              <ErrorAlert message={loadError.value.message} title="状态加载失败" retryable onRetry={retry} />
            ) : (
              <>
                <div class="flex flex-wrap items-center gap-2 text-sm">
                  <span class="text-muted-foreground">当前状态</span>
                  {status.value?.bound ? (
                    <>
                      <Badge>已绑定 {status.value.memberId}</Badge>
                      {status.value.hasExAccess ? (
                        <Badge variant="secondary">里站可用</Badge>
                      ) : (
                        <Badge variant="outline">仅前站</Badge>
                      )}
                    </>
                  ) : status.value ? (
                    <Badge variant="outline">未绑定</Badge>
                  ) : (
                    <Badge variant="outline">状态未获取</Badge>
                  )}
                </div>

                {successMessage.value ? (
                  <Alert>
                    <CircleCheckIcon />
                    <AlertTitle>已保存</AlertTitle>
                    <AlertDescription>{successMessage.value}</AlertDescription>
                  </Alert>
                ) : null}

                {errorMessage.value ? <ErrorAlert message={errorMessage.value} title="操作失败" /> : null}

                <form class="flex flex-col gap-4" onSubmit={submit}>
                  {cookieFields.map((field) => (
                    <FormField
                      id={field.name}
                      key={field.name}
                      label={field.label}
                      labelClass="font-mono"
                      modelValue={form.value[field.name]}
                      placeholder={field.hint}
                      onUpdate:modelValue={(value) => (form.value[field.name] = value)}
                    />
                  ))}

                  <div class="flex flex-wrap gap-2">
                    <Button {...{ disabled: saving.value, type: "submit" }}>
                      {saving.value ? "校验中…" : "保存并校验"}
                    </Button>
                    {status.value?.bound ? (
                      <Button variant="outline" {...{ disabled: saving.value, type: "button", onClick: unbind }}>
                        解绑
                      </Button>
                    ) : null}
                  </div>
                </form>
              </>
            )}
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
                在 e-hentai.org 下找到 <code class="text-foreground">ipb_member_id</code> 和{" "}
                <code class="text-foreground">ipb_pass_hash</code>，在 exhentai.org 下找到{" "}
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
              当前登录：<span class="font-medium">{authStore.user?.username ?? "-"}</span>
            </span>
            <Button variant="outline" {...{ onClick: signOut }}>
              <LogOutIcon />
              退出登录
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  },
})
