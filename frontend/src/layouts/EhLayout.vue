<script setup lang="ts">
import { InfoIcon } from "@lucide/vue"
import { computed } from "vue"
import { RouterLink, RouterView } from "vue-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useEhCredential } from "@/composables/useEhCredential"

const credential = useEhCredential()
/* 读不到绑定状态就当作没问过，不显示任何提示：这条提示是背景信息，不该因为它失败而打扰阅读。 */
const anonymous = computed(() => credential.status.value?.bound === false)
</script>

<template>
  <Alert v-if="anonymous">
    <InfoIcon />
    <AlertTitle>当前以匿名身份浏览前站</AlertTitle>
    <AlertDescription>
      绑定 e 站账号后才能浏览里站，也才会用上你自己账号的过滤器设置。
      <RouterLink class="underline underline-offset-4" :to="{ name: 'settings' }">去设置绑定</RouterLink>
    </AlertDescription>
  </Alert>
  <RouterView v-slot="{ Component }">
    <!-- 搜索、历史与详情各保留一份，换图集复用详情。数据的新鲜由查询缓存管，这里只留住界面状态。 -->
    <KeepAlive>
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
