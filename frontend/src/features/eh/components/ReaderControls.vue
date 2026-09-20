<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon, XIcon } from "@lucide/vue"
import { computed } from "vue"

import { Button } from "@/components/ui/button"
import type { ReaderPlaybackState } from "@/features/eh/composables/useReaderPlayback"

const props = defineProps<{
  title?: string
  visible: boolean
  total: number
  playback: ReaderPlaybackState
}>()
const emit = defineEmits<{ exit: []; toggleAutoPaging: []; setInterval: [seconds: number] }>()
const page = defineModel<number>("page", { required: true })
const seeking = defineModel<boolean>("seeking", { required: true })
const progressPercent = computed(() => (props.total > 1 ? ((page.value - 1) / (props.total - 1)) * 100 : 0))

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
        :aria-label="playback.autoPaging ? '暂停自动翻页' : '开始自动翻页'"
        :aria-pressed="playback.autoPaging"
        v-bind="chromeButton"
        :disabled="!playback.canStart"
        @click="emit('toggleAutoPaging')"
      >
        <PauseIcon v-if="playback.autoPaging" />
        <PlayIcon v-else />
      </Button>
      <Button
        aria-label="减少自动翻页间隔"
        v-bind="chromeButton"
        :disabled="playback.interval <= 1"
        @click="emit('setInterval', playback.interval - 1)"
      >
        <MinusIcon />
      </Button>
      <output aria-label="自动翻页间隔" class="min-w-10 text-center text-sm text-white/90 tabular-nums">
        {{ playback.interval }} 秒
      </output>
      <Button
        aria-label="增加自动翻页间隔"
        v-bind="chromeButton"
        :disabled="playback.interval >= 20"
        @click="emit('setInterval', playback.interval + 1)"
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
      v-if="total > 0"
      v-model.number="page"
      type="range"
      min="1"
      :max="total"
      step="1"
      aria-label="阅读进度"
      :aria-valuetext="`第 ${page} 页，共 ${total} 页`"
      class="reader-progress h-8 min-w-0 flex-1 cursor-pointer"
      :style="{ '--reader-progress': `${progressPercent}%` }"
      @pointerdown="startSeeking"
      @pointerup="seeking = false"
      @pointercancel="seeking = false"
      @lostpointercapture="seeking = false"
    />
    <!-- 页数未知时不创建原生滑块，避免浏览器先按 1–1 把恢复页码夹到首页。 -->
    <div v-else aria-hidden="true" class="h-8 min-w-0 flex-1" />
    <span class="text-sm text-white/90 tabular-nums">{{ total || "…" }}</span>
    <Button aria-label="下一页" v-bind="chromeButton" :disabled="!total || page >= total" @click="page += 1">
      <ChevronRightIcon />
    </Button>
  </div>
</template>
