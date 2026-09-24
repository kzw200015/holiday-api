<script setup lang="ts">
import { InfoIcon } from "@lucide/vue"
import { computed } from "vue"
import { RouterLink, RouterView } from "vue-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useEhCredential } from "@/features/eh/composables/useEhCredential"
import { useGalleryPreferences } from "@/features/eh/composables/useGalleryPreferences"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"

const credential = useEhCredential()
/* 读不到绑定状态就当作没问过，不显示任何提示：这条提示是背景信息，不该因为它失败而打扰阅读。 */
const anonymous = computed(() => credential.status.value?.bound === false)

/*
 * 偏好在这里等到，页面组件延到读到之后才创建：搜索页开出的第一次查询要用分类偏好，
 * 偏好还没到就发出去，搜的是一组不对的条件。读不到就停在这里让用户重试，不拿默认值放行。
 */
const { ready, loadError, reload } = useGalleryPreferences()
</script>

<template>
  <Alert v-if="anonymous">
    <InfoIcon />
    <AlertTitle>当前以匿名身份浏览表站</AlertTitle>
    <AlertDescription>
      绑定 e 站账号后才能浏览里站，也才会用上你自己账号的过滤器设置。
      <RouterLink :to="{ name: 'settings' }">去设置绑定</RouterLink>
    </AlertDescription>
  </Alert>
  <div v-if="!ready && loadError" class="page-content">
    <ErrorAlert :message="loadError" title="加载失败" retryable @retry="reload" />
  </div>
  <div v-else-if="!ready" class="page-content flex flex-col gap-4">
    <Skeleton class="h-9 w-full" />
    <Skeleton class="h-4 w-32" />
    <Skeleton class="h-40 w-full" />
  </div>
  <RouterView v-else v-slot="{ Component }">
    <!-- 搜索、历史与详情各保留一份，换图集复用详情：留住的是滚动位置、输入与已翻的页，数据在查询缓存里（见 ADR-0006）。 -->
    <KeepAlive>
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
