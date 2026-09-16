<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon, XIcon } from "@lucide/vue"
import { useDocumentVisibility, useIntervalFn } from "@vueuse/core"
import { computed, ref, watch } from "vue"
import { onBeforeRouteLeave } from "vue-router"

import { Button } from "@/components/ui/button"
import { usePersistedValue } from "@/composables/usePersistedValue"
import { useAuthStore } from "@/stores/AuthStore"

/* 换图集由父级以 key 重建，自动翻页不跨图集继续运行。 */
const props = defineProps<{ title?: string; visible: boolean; total: number; dragging: boolean }>()
const emit = defineEmits<{ exit: [] }>()
const page = defineModel<number>("page", { required: true })
const seeking = defineModel<boolean>("seeking", { required: true })
const autoPaging = ref(false)
const visibility = useDocumentVisibility()
const canStart = computed(() => props.total > 0 && page.value < props.total && visibility.value === "visible")
const interacting = computed(() => seeking.value || props.dragging)
const { value: interval, set: setInterval } = usePersistedValue("reader-interval", useAuthStore().user?.id, (raw) =>
  typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 20 ? raw : 5,
)

const progressPercent = computed(() => (props.total > 1 ? ((page.value - 1) / (props.total - 1)) * 100 : 0))
const { pause, resume } = useIntervalFn(
  () => {
    if (canStart.value && !interacting.value) {
      page.value += 1
    }
  },
  computed(() => interval.value * 1000),
  { immediate: false },
)

function stop() {
  autoPaging.value = false
}

function toggleAutoPaging() {
  if (autoPaging.value) {
    stop()
  } else if (canStart.value) {
    autoPaging.value = true
  }
}

watch(
  canStart,
  (allowed) => {
    if (!allowed) {
      stop()
    }
  },
  { flush: "sync" },
)
/* 开关和拖动控制计时；间隔变化由 useIntervalFn 重计时，手动换页不重置节奏。 */
watch(
  [autoPaging, interacting],
  () => {
    if (autoPaging.value && !interacting.value) {
      resume()
    } else {
      pause()
    }
  },
  { flush: "sync" },
)
onBeforeRouteLeave(stop)

function startSeeking(event: PointerEvent) {
  seeking.value = true
  const input = event.currentTarget as HTMLInputElement
  input.setPointerCapture(event.pointerId)
}

const chromeButton = {
  class: "cursor-pointer text-white hover:bg-white/10 hover:text-white",
  size: "icon-sm",
  variant: "ghost",
} as const
</script>

<template>
  <!-- 上下栏不占图片高度；隐藏后停止接收焦点和点击，但不打断自动翻页。 -->
  <div
    :inert="!visible"
    class="absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 transition-opacity"
    :class="visible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    @click.stop
  >
    <Button aria-label="退出阅读" v-bind="chromeButton" @click="emit('exit')">
      <XIcon />
    </Button>
    <p class="min-w-0 flex-1 truncate text-sm text-white/90">{{ title ?? "加载中…" }}</p>
    <div class="flex shrink-0 items-center gap-1">
      <Button
        :aria-label="autoPaging ? '暂停自动翻页' : '开始自动翻页'"
        :aria-pressed="autoPaging"
        v-bind="chromeButton"
        :disabled="!canStart"
        @click="toggleAutoPaging"
      >
        <PauseIcon v-if="autoPaging" />
        <PlayIcon v-else />
      </Button>
      <Button
        aria-label="减少自动翻页间隔"
        v-bind="chromeButton"
        :disabled="interval <= 1"
        @click="setInterval(interval - 1)"
      >
        <MinusIcon />
      </Button>
      <output aria-label="自动翻页间隔" class="min-w-10 text-center text-sm text-white/90 tabular-nums">
        {{ interval }} 秒
      </output>
      <Button
        aria-label="增加自动翻页间隔"
        v-bind="chromeButton"
        :disabled="interval >= 20"
        @click="setInterval(interval + 1)"
      >
        <PlusIcon />
      </Button>
    </div>
  </div>
  <div
    :inert="!visible"
    class="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity"
    :class="visible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    @click.stop
  >
    <Button aria-label="上一页" v-bind="chromeButton" :disabled="!total || page <= 1" @click="page -= 1">
      <ChevronLeftIcon />
    </Button>
    <span class="min-w-6 text-center text-sm text-white/90 tabular-nums">{{ page }}</span>
    <input
      v-model.number="page"
      type="range"
      min="1"
      :max="total || 1"
      step="1"
      :disabled="!total"
      aria-label="阅读进度"
      :aria-valuetext="`第 ${page} 页，共 ${total} 页`"
      class="reader-progress h-8 min-w-0 flex-1 cursor-pointer"
      :style="{ '--reader-progress': `${progressPercent}%` }"
      @pointerdown="startSeeking"
      @pointerup="seeking = false"
      @pointercancel="seeking = false"
      @lostpointercapture="seeking = false"
    />
    <span class="text-sm text-white/90 tabular-nums">{{ total || "…" }}</span>
    <Button aria-label="下一页" v-bind="chromeButton" :disabled="!total || page >= total" @click="page += 1">
      <ChevronRightIcon />
    </Button>
  </div>
</template>
