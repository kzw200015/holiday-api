<script setup lang="ts">
import { clamp, useEventListener } from "@vueuse/core"
import { computed, ref, watch } from "vue"
import { onBeforeRouteLeave, useRouter } from "vue-router"

import { fetchGalleryDetail } from "@/api/eh"
import ErrorAlert from "@/components/ErrorAlert.vue"
import ReaderControls from "@/components/gallery/ReaderControls.vue"
import ReaderStrip from "@/components/gallery/ReaderStrip.vue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useGalleryNavigation } from "@/composables/galleryNavigation"
import { useQuery } from "@/composables/useQuery"
import { useReadingProgress } from "@/composables/useReadingProgress"
import { backOrReplace } from "@/lib/navigation"

const PAGE_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  PageDown: 1,
  " ": 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  PageUp: -1,
}

/* 路由 props 在离开页面时仍保留本图集参数，进度补报不会读到下一页的路由。 */
const props = defineProps<{ gid: number; token: string; page: number }>()
const router = useRouter()
const navigation = useGalleryNavigation()
const identity = computed(() => `${props.gid}/${props.token}`)
const {
  data: detail,
  error,
  loading,
} = useQuery(identity, (_identity, signal) => fetchGalleryDetail(props.gid, props.token, signal))
const gallery = computed(() => detail.value?.gallery)
const totalPages = computed(() => gallery.value?.fileCount ?? 0)
/* 页码来自 URL，详情到达后才能按实际页数约束，避免手改地址请求越界图片。 */
const page = computed({
  get: () => (totalPages.value ? clamp(props.page, 1, totalPages.value) : Math.max(1, props.page)),
  set: goTo,
})
const imageUrlTemplate = computed(() => detail.value?.imageUrlTemplate ?? "")
const seeking = ref(false)
const dragging = ref(false)
const controlsVisible = ref(true)

function goTo(next: number) {
  if (!totalPages.value) {
    return
  }
  const clamped = clamp(next, 1, totalPages.value)
  if (clamped === props.page) {
    return
  }
  /* 用 replace 让浏览器后退直接离开阅读，而非逐页回退。 */
  void router.replace({ name: "reader", params: { gid: props.gid, token: props.token, page: clamped } })
}

function exit() {
  backOrReplace(router, { name: "gallery-detail", params: { gid: props.gid, token: props.token } })
}

/* 有效进度：详情到达且页数已知。进度上报与离开通知共用这一份判断。 */
const position = computed(() =>
  detail.value && totalPages.value ? { gid: props.gid, token: props.token, page: page.value } : null,
)
onBeforeRouteLeave(() => {
  if (position.value) {
    void navigation.trigger(position.value)
  }
})
useReadingProgress(position)

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  /* 焦点位于操作按钮时，空格和回车应保留原生激活行为。 */
  if (
    event.target instanceof HTMLElement &&
    event.target.closest("button, input, textarea, select, [contenteditable]")
  ) {
    return
  }
  const step = PAGE_STEPS[event.key]
  if (step) {
    event.preventDefault()
    goTo(page.value + step)
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault()
    goTo(event.key === "Home" ? 1 : totalPages.value)
  } else if (event.key === "Escape") {
    event.preventDefault()
    exit()
  }
})

/* URL 越界时由 goTo 把地址收敛到实际页数。 */
watch(
  [detail, page],
  () => {
    if (detail.value) {
      goTo(page.value)
    }
  },
  { immediate: true },
)
watch(identity, () => {
  seeking.value = false
  dragging.value = false
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-black" @click="controlsVisible = !controlsVisible">
    <div v-if="error" class="flex flex-1 items-center justify-center p-4">
      <div class="max-w-md">
        <ErrorAlert :message="error.message" title="打不开这个图集">
          <Button size="sm" variant="outline" @click="exit">返回</Button>
        </ErrorAlert>
      </div>
    </div>
    <div v-else class="relative flex min-h-0 flex-1 overflow-hidden">
      <ReaderStrip
        v-if="imageUrlTemplate && totalPages"
        :key="identity"
        v-model:page="page"
        v-model:dragging="dragging"
        :total="totalPages"
        :template="imageUrlTemplate"
        :seeking="seeking"
      />
      <Skeleton v-if="loading" class="absolute inset-x-1/4 inset-y-8 rounded-lg" />
    </div>
    <ReaderControls
      :key="identity"
      v-model:page="page"
      v-model:seeking="seeking"
      :title="gallery?.title"
      :visible="controlsVisible"
      :total="totalPages"
      :dragging="dragging"
      @exit="exit"
    />
  </div>
</template>
