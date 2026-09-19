<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query"
import { watch } from "vue"
import { RouterView } from "vue-router"

import { useAuthStore } from "@/stores/AuthStore"

const authStore = useAuthStore()
const queryClient = useQueryClient()
/* 缓存活在页面之外，所以换账号时页面重建还不够：不清掉就会把上一个账号的数据端给新账号。 */
watch(
  () => authStore.pageRevision,
  () => queryClient.clear(),
)
</script>

<template>
  <!-- 阅读器全屏且不缓存；离开布局时仅停用布局内的页面。 -->
  <RouterView v-slot="{ Component }">
    <KeepAlive include="AppLayout">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
