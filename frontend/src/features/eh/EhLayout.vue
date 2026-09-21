<script setup lang="ts">
import { InfoIcon } from "@lucide/vue"
import { computed } from "vue"
import { RouterLink, RouterView } from "vue-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useEhCredential } from "@/features/eh/composables/useEhCredential"
import { useGalleryPreferences } from "@/features/eh/composables/useGalleryPreferences"
import { useSearchHistory } from "@/features/eh/composables/useSearchHistory"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"

const credential = useEhCredential()
/* 读不到绑定状态就当作没问过，不显示任何提示：这条提示是背景信息，不该因为它失败而打扰阅读。 */
const anonymous = computed(() => credential.status.value?.bound === false)

/*
 * 这两份账号数据在这里等齐，页面组件延到备齐之后才创建。
 *
 * 等在布局层是因为搜索页开出的第一次查询要用分类偏好：偏好还没到就发出去，搜的是一组不对的条件。
 * 读不到就停在这里让用户重试，不拿默认值放行：这两份的保存都是整份提交，带着一份没读到的空值进去，
 * 下一次改动就会把服务端原有的内容冲掉。
 */
const preferences = useGalleryPreferences()
const history = useSearchHistory()
const ready = computed(() => preferences.ready.value && history.ready.value)
const loadError = computed(() => preferences.loadError.value || history.loadError.value)

function reload() {
  if (!preferences.ready.value) {
    preferences.reload()
  }
  if (!history.ready.value) {
    history.reload()
  }
}
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
  <div v-if="!ready && loadError" class="page-content">
    <ErrorAlert :message="loadError" title="加载失败" retryable @retry="reload" />
  </div>
  <div v-else-if="!ready" class="page-content flex flex-col gap-4">
    <Skeleton class="h-9 w-full" />
    <Skeleton class="h-4 w-32" />
    <Skeleton class="h-40 w-full" />
  </div>
  <RouterView v-else v-slot="{ Component }">
    <!-- 搜索、历史与详情各保留一份，换图集复用详情。搜索结果、历史与评论就活在这些页面里，跟着一起留下。 -->
    <KeepAlive>
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
