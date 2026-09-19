<script setup lang="ts">
import { InfoIcon } from "@lucide/vue"
import { useQueryClient } from "@tanstack/vue-query"
import { computed, onMounted, watch } from "vue"
import { RouterLink, RouterView } from "vue-router"

import { ehKeys } from "@/api/eh"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useEhStore } from "@/stores/EhStore"

const ehStore = useEhStore()
const queryClient = useQueryClient()
/* 换绑 e 站账号后能看到的内容就变了：受凭据影响的缓存连页面一起丢掉，账号数据不受影响。
 * 只标记失效而不在这里重取——下面的页面马上要按新的 key 重建，由它们去取，免得同一份数据取两遍。 */
watch(
  () => ehStore.cacheRevision,
  () => void queryClient.invalidateQueries({ queryKey: ehKeys.content, refetchType: "none" }),
)
/* 读不到绑定状态就当作没问过，不显示任何提示：这条提示是背景信息，不该因为它失败而打扰阅读。 */
const anonymous = computed(() => ehStore.credential?.bound === false)

onMounted(() => {
  ehStore.loadCredential().catch(() => {})
})
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
    <!-- 搜索、历史与详情各保留一份；换图集复用详情，凭据变化则清空 EH 内部缓存。 -->
    <KeepAlive :key="ehStore.cacheRevision">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
