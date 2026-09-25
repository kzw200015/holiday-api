<script setup lang="ts">
import { LibraryIcon } from "@lucide/vue"
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRegistrationOpen } from "@/features/auth/composables/useRegistrationOpen"
import { useAuthStore } from "@/features/auth/store"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"
import FormField from "@/shared/components/FormField.vue"
import { toError } from "@/shared/lib/errors"

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const registrationOpen = useRegistrationOpen()
const username = ref("")
const password = ref("")
const registering = ref(false)
const errorMessage = ref("")
const loading = ref(false)
const actionLabel = computed(() => (registering.value ? "注册并登录" : "登录"))

function switchMode() {
  registering.value = !registering.value
  errorMessage.value = ""
}

async function submit() {
  loading.value = true
  errorMessage.value = ""
  try {
    await authStore.authenticate(registering.value ? "register" : "login", username.value, password.value)
    /* 被守卫拦下来时带了原来要去的地方，登录后送回去。 */
    const redirect = route.query.redirect
    await router.replace(typeof redirect === "string" && redirect ? redirect : { name: "gallery-list" })
  } catch (error) {
    errorMessage.value = toError(error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-svh items-center justify-center p-4">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <div
          class="bg-sidebar-primary text-sidebar-primary-foreground mb-2 flex size-9 items-center justify-center rounded-lg"
        >
          <LibraryIcon class="size-5" />
        </div>
        <CardTitle>{{ registering ? "创建账号" : "登录" }}</CardTitle>
        <CardDescription>
          {{ registering ? "注册后即可浏览图库。" : "用本站账号登录，e 站账号在设置页单独绑定。" }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="flex flex-col gap-4" @submit.prevent="submit">
          <FormField
            id="username"
            v-model="username"
            autocomplete="username"
            label="用户名"
            placeholder="3 到 32 位字母、数字、下划线或连字符"
          />
          <FormField
            id="password"
            v-model="password"
            :autocomplete="registering ? 'new-password' : 'current-password'"
            label="密码"
            placeholder="至少 8 位"
            type="password"
          />
          <ErrorAlert v-if="errorMessage" :message="errorMessage" :title="registering ? '注册失败' : '登录失败'" />
          <Button :disabled="loading" type="submit">{{ loading ? "请稍候…" : actionLabel }}</Button>
          <!-- 注册关着就不给切换入口，免得填完表单提交了才知道注册不了。 -->
          <Button v-if="registrationOpen" variant="ghost" type="button" :disabled="loading" @click="switchMode">
            {{ registering ? "已有账号，去登录" : "还没有账号，去注册" }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
