<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon, XIcon } from "@lucide/vue"
import { computed, ref, watch } from "vue"
import { onBeforeRouteLeave } from "vue-router"

import ErrorAlert from "@/components/ErrorAlert.vue"
import ReaderStrip from "@/components/gallery/ReaderStrip.vue"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutoPage } from "@/composables/useAutoPage"
import { useReader } from "@/composables/useReader"
import { useAuthStore } from "@/stores/AuthStore"

const props = defineProps<{ gid: number; token: string; page: number }>()
const { gallery, error, loading, page, totalPages, imageUrlTemplate, chromeVisible, showChrome, goTo, exit } =
  useReader(props)
const seeking = ref(false)
const dragging = ref(false)
/* 进度条捕获指针期间保持操作栏可用，松手后重新开始隐藏计时。 */
const controlsVisible = computed(() => chromeVisible.value || seeking.value)
watch(seeking, showChrome)
const identity = computed(() => `${props.gid}/${props.token}`)
const {
  active: autoPaging,
  canStart,
  interval,
  setInterval,
  toggle,
  stop,
} = useAutoPage(
  { identity, page, total: totalPages, dragging: computed(() => seeking.value || dragging.value) },
  goTo,
  useAuthStore().user?.id,
)
onBeforeRouteLeave(stop)
watch(identity, () => {
  seeking.value = false
  dragging.value = false
})
/* 控件写入仍经过页码约束和持久化入口，不另存一份表单状态。 */
const selectedPage = computed({ get: () => page.value, set: goTo })
const selectedInterval = computed({ get: () => interval.value, set: setInterval })
const progressPercent = computed(() => (totalPages.value > 1 ? ((page.value - 1) / (totalPages.value - 1)) * 100 : 0))

function startSeeking(event: PointerEvent) {
  seeking.value = true
  const input = event.currentTarget as HTMLInputElement
  input.setPointerCapture(event.pointerId)
}

const chromeButton = {
  class: "pointer-events-auto cursor-pointer text-white hover:bg-white/10 hover:text-white",
  size: "icon-sm",
  variant: "ghost",
} as const
</script>

<template>
  <div
    class="fixed inset-0 flex flex-col bg-black"
    @pointerdown="showChrome"
    @mousemove="showChrome"
    @focusin="showChrome"
  >
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
        :page="page"
        :total="totalPages"
        :template="imageUrlTemplate"
        :seeking="seeking"
        @page-change="goTo"
        @dragging-change="dragging = $event"
      />
      <Skeleton v-if="loading" class="absolute inset-x-1/4 inset-y-8 rounded-lg" />
    </div>
    <!-- 上下栏不占图片高度；隐藏后停止接收焦点和点击。 -->
    <div
      :inert="!controlsVisible"
      class="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 transition-opacity"
      :class="controlsVisible ? 'opacity-100' : 'opacity-0'"
    >
      <Button aria-label="退出阅读" v-bind="chromeButton" @click="exit">
        <XIcon />
      </Button>
      <p class="min-w-0 flex-1 truncate text-sm text-white/90">{{ gallery?.title ?? "加载中…" }}</p>
    </div>
    <div
      :inert="!controlsVisible"
      class="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity"
      :class="controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    >
      <Button aria-label="上一页" v-bind="chromeButton" :disabled="!totalPages || page <= 1" @click="goTo(page - 1)">
        <ChevronLeftIcon />
      </Button>
      <span class="min-w-6 text-center text-sm text-white/90 tabular-nums">{{ page }}</span>
      <input
        v-model.number="selectedPage"
        type="range"
        min="1"
        :max="totalPages || 1"
        step="1"
        :disabled="!totalPages"
        aria-label="阅读进度"
        :aria-valuetext="`第 ${page} 页，共 ${totalPages} 页`"
        class="reader-progress h-8 min-w-0 flex-1 cursor-pointer"
        :style="{ '--reader-progress': `${progressPercent}%` }"
        @pointerdown="startSeeking"
        @pointerup="seeking = false"
        @pointercancel="seeking = false"
        @lostpointercapture="seeking = false"
      />
      <span class="text-sm text-white/90 tabular-nums">{{ totalPages || "…" }}</span>
      <Button
        aria-label="下一页"
        v-bind="chromeButton"
        :disabled="!totalPages || page >= totalPages"
        @click="goTo(page + 1)"
      >
        <ChevronRightIcon />
      </Button>
      <div class="flex items-center gap-1">
        <Button
          :aria-label="autoPaging ? '暂停自动翻页' : '开始自动翻页'"
          :aria-pressed="autoPaging"
          v-bind="chromeButton"
          :disabled="!canStart"
          @click="toggle"
        >
          <PauseIcon v-if="autoPaging" />
          <PlayIcon v-else />
        </Button>
        <select
          v-model.number="selectedInterval"
          aria-label="自动翻页间隔"
          class="h-8 rounded border border-white/20 bg-zinc-950 px-1 text-sm text-white"
        >
          <option v-for="seconds in 20" :key="seconds" :value="seconds">{{ seconds }} 秒</option>
        </select>
      </div>
    </div>
  </div>
</template>
