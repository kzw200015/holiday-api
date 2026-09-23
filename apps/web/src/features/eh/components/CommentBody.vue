<script setup lang="ts">
import type { CommentSegment } from "@myapi/shared"

defineProps<{ segments: CommentSegment[] }>()
</script>

<template>
  <!-- 第三方评论只渲染结构化片段，不使用 v-html。 -->
  <p class="text-sm leading-relaxed break-words">
    <template v-for="(segment, index) in segments" :key="index">
      <br v-if="segment.type === 'break'" />
      <a
        v-else-if="segment.type === 'link'"
        class="text-primary underline underline-offset-2"
        :href="segment.href"
        rel="noreferrer noopener"
        target="_blank"
        >{{ segment.text }}</a
      >
      <span v-else>{{ segment.text }}</span>
    </template>
  </p>
</template>
