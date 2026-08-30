import { LibraryIcon } from "@lucide/vue"
import { computed, defineComponent, ref } from "vue"
import { useRoute, useRouter } from "vue-router"

import { errorText } from "@/api/httpClient"
import ErrorAlert from "@/components/ErrorAlert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/stores/AuthStore"

/* 登录 / 注册页。走顶层路由不套 AppLayout，所以没有侧边栏 */
export default defineComponent({
  name: "LoginView",
  setup() {
    const route = useRoute()
    const router = useRouter()
    const authStore = useAuthStore()

    const username = ref("")
    const password = ref("")
    /* 同一个表单切换用途，省得为注册单开一页 */
    const registering = ref(false)
    const errorMessage = ref("")
    const loading = ref(false)

    const actionLabel = computed(() => (registering.value ? "注册并登录" : "登录"))

    async function submit(event: Event) {
      event.preventDefault()
      loading.value = true
      errorMessage.value = ""
      try {
        if (registering.value) {
          await authStore.register(username.value, password.value)
        } else {
          await authStore.login(username.value, password.value)
        }
        /* 被守卫拦下来时带了原来要去的地方，登录后送回去 */
        const redirect = route.query.redirect
        await router.replace(typeof redirect === "string" && redirect ? redirect : { name: "gallery-list" })
      } catch (error) {
        errorMessage.value = errorText(error, "登录失败")
      } finally {
        loading.value = false
      }
    }

    return () => (
      <div class="bg-background flex min-h-svh items-center justify-center p-4">
        <Card class="w-full max-w-sm">
          <CardHeader>
            <div class="bg-sidebar-primary text-sidebar-primary-foreground mb-2 flex size-9 items-center justify-center rounded-lg">
              <LibraryIcon class="size-5" />
            </div>
            <CardTitle>{registering.value ? "创建账号" : "登录"}</CardTitle>
            <CardDescription>
              {registering.value ? "注册后即可浏览图库。" : "用本站账号登录，e 站账号在设置页单独绑定。"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form class="flex flex-col gap-4" {...{ onSubmit: submit }}>
              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium" for="username">
                  用户名
                </label>
                {/* Input 只声明了 modelValue 一类的 props，原生属性经展开透传给根元素 */}
                <Input
                  modelValue={username.value}
                  {...{
                    autocomplete: "username",
                    id: "username",
                    placeholder: "3 到 32 位字母、数字、下划线或连字符",
                    "onUpdate:modelValue": (value: string | number) => (username.value = String(value)),
                  }}
                />
              </div>

              <div class="flex flex-col gap-2">
                <label class="text-sm font-medium" for="password">
                  密码
                </label>
                <Input
                  modelValue={password.value}
                  {...{
                    autocomplete: registering.value ? "new-password" : "current-password",
                    id: "password",
                    placeholder: "至少 8 位",
                    type: "password",
                    "onUpdate:modelValue": (value: string | number) => (password.value = String(value)),
                  }}
                />
              </div>

              {errorMessage.value ? (
                <ErrorAlert message={errorMessage.value} title={registering.value ? "注册失败" : "登录失败"} />
              ) : null}

              <Button {...{ disabled: loading.value, type: "submit" }}>
                {loading.value ? "请稍候…" : actionLabel.value}
              </Button>

              <Button
                class="text-muted-foreground"
                variant="ghost"
                {...{
                  type: "button",
                  onClick: () => {
                    registering.value = !registering.value
                    errorMessage.value = ""
                  },
                }}
              >
                {registering.value ? "已有账号，去登录" : "还没有账号，去注册"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  },
})
