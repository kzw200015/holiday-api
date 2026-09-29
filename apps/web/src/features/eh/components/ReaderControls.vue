<script setup lang="ts">
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MaximizeIcon,
  MinimizeIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  XIcon,
} from "@lucide/vue"
import { READER_INTERVAL_MAX, READER_INTERVAL_MIN } from "@myapi/shared/eh"
import { computed } from "vue"

import { Button } from "@/components/ui/button"
import type { ReaderSession } from "@/features/eh/composables/useReaderSession"

/* 翻页、按住进度条、自动翻页都直接交给这次阅读（见 useReaderSession）；退出与全屏归阅读器页面管，照常发事件。 */
const props = defineProps<{
  session: Pick<
    ReaderSession,
    "page" | "total" | "seeking" | "playback" | "toggleAutoPaging" | "changeInterval" | "reloadInterval"
  >
  title?: string
  visible: boolean
  /* 浏览器支不支持页面全屏（iPhone 上的 Safari 不支持，那里不给按钮），以及眼下是不是全屏。 */
  canFullscreen: boolean
  fullscreen: boolean
}>()
const emit = defineEmits<{
  exit: []
  toggleFullscreen: []
}>()
const progressPercent = computed(() =>
  props.session.total > 1 ? ((props.session.page - 1) / (props.session.total - 1)) * 100 : 0,
)

function startSeeking(event: PointerEvent) {
  props.session.seeking = true
  const input = event.currentTarget as HTMLInputElement
  input.setPointerCapture(event.pointerId)
}

/* 阅读器底色固定是黑的：按钮文字和悬停色按黑底改成白色系。 */
const chromeButton = {
  class: "text-white hover:bg-white/10 hover:text-white",
  size: "icon-sm",
  variant: "ghost",
} as const
</script>

<template>
  <!-- 上下栏不占图片高度；隐藏后停止接收焦点和点击，但不打断自动翻页。
       底栏左右和底部多留些空：两端的翻页按钮正好落在屏幕圆角上。 -->
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
        :aria-label="session.playback.autoPaging ? '暂停自动翻页' : '开始自动翻页'"
        :aria-pressed="session.playback.autoPaging"
        v-bind="chromeButton"
        :disabled="!session.playback.canStart"
        @click="session.toggleAutoPaging()"
      >
        <PauseIcon v-if="session.playback.autoPaging" />
        <PlayIcon v-else />
      </Button>
      <Button
        aria-label="减少自动翻页间隔"
        v-bind="chromeButton"
        :disabled="!session.playback.intervalReady || session.playback.interval <= READER_INTERVAL_MIN"
        @click="session.changeInterval(session.playback.interval - 1)"
      >
        <MinusIcon />
      </Button>
      <!-- 偏好没读到时调了也存不上，所以不给调；读失败了就在秒数的位置给个重试。 -->
      <Button
        v-if="session.playback.intervalFailed"
        aria-label="自动翻页间隔没读到，重试"
        title="自动翻页间隔没读到，点此重试"
        v-bind="chromeButton"
        size="sm"
        @click="session.reloadInterval()"
      >
        重试
      </Button>
      <output v-else aria-label="自动翻页间隔" class="min-w-10 text-center text-sm text-white/90 tabular-nums">
        {{ session.playback.intervalReady ? `${session.playback.interval} 秒` : "…" }}
      </output>
      <Button
        aria-label="增加自动翻页间隔"
        v-bind="chromeButton"
        :disabled="!session.playback.intervalReady || session.playback.interval >= READER_INTERVAL_MAX"
        @click="session.changeInterval(session.playback.interval + 1)"
      >
        <PlusIcon />
      </Button>
      <Button
        v-if="canFullscreen"
        :aria-label="fullscreen ? '退出全屏' : '全屏'"
        v-bind="chromeButton"
        @click="emit('toggleFullscreen')"
      >
        <MinimizeIcon v-if="fullscreen" />
        <MaximizeIcon v-else />
      </Button>
    </div>
  </div>
  <div
    :inert="!visible"
    class="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-opacity"
    :class="visible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    @click.stop
  >
    <Button
      aria-label="上一页"
      v-bind="chromeButton"
      :disabled="!session.total || session.page <= 1"
      @click="session.page -= 1"
    >
      <ChevronLeftIcon />
    </Button>
    <span class="min-w-6 text-center text-sm text-white/90 tabular-nums">{{ session.page }}</span>
    <input
      v-if="session.total > 0"
      v-model.number="session.page"
      type="range"
      min="1"
      :max="session.total"
      step="1"
      aria-label="阅读进度"
      :aria-valuetext="`第 ${session.page} 页，共 ${session.total} 页`"
      class="reader-progress h-8 min-w-0 flex-1 cursor-pointer"
      :style="{ '--reader-progress': `${progressPercent}%` }"
      @pointerdown="startSeeking"
      @pointerup="session.seeking = false"
      @pointercancel="session.seeking = false"
      @lostpointercapture="session.seeking = false"
    />
    <!-- 页数未知时不创建原生滑块，避免浏览器先按 1–1 把恢复页码夹到首页。 -->
    <div v-else aria-hidden="true" class="h-8 min-w-0 flex-1" />
    <span class="text-sm text-white/90 tabular-nums">{{ session.total || "…" }}</span>
    <Button
      aria-label="下一页"
      v-bind="chromeButton"
      :disabled="!session.total || session.page >= session.total"
      @click="session.page += 1"
    >
      <ChevronRightIcon />
    </Button>
  </div>
</template>
