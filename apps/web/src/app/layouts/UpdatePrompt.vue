<script setup lang="ts">
import { RefreshCwIcon } from "@lucide/vue"
import { useEventListener } from "@vueuse/core"
import { useRegisterSW } from "virtual:pwa-register/vue"
import { shallowRef } from "vue"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/*
 * 新版 service worker 装好后停在 waiting，旧页面关完之前不会接管，刷新也不行：
 * 所以在这里提示，用户点了才让它接管，接管后整页刷新。只放在布局里，阅读器全屏时不打扰
 */
const registration = shallowRef<ServiceWorkerRegistration>()
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW: (_url, registered) => {
    registration.value = registered
  },
})

/* 哈希路由切页不算导航，浏览器不会顺带检查更新；装成应用后又常年挂在后台，切回来时主动查一次 */
useEventListener(document, "visibilitychange", () => {
  if (document.visibilityState === "visible") {
    /* 离线等原因查不成就算了，下次切回来再查 */
    registration.value?.update().catch(() => undefined)
  }
})
</script>

<template>
  <Alert v-if="needRefresh">
    <RefreshCwIcon />
    <AlertTitle>有新版本</AlertTitle>
    <AlertDescription>刷新后生效，当前页面的浏览位置不会保留。</AlertDescription>
    <AlertAction>
      <Button size="sm" type="button" @click="updateServiceWorker()">刷新</Button>
    </AlertAction>
  </Alert>
</template>
