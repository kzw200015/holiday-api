<script setup lang="ts">
import { Badge } from "@/components/ui/badge"
</script>

<template>
  <!-- 长标签要折行：放开固定高度与不换行；折成多行后胶囊圆角会切掉四角的字，改用小圆角。 -->
  <Badge variant="secondary" class="h-auto min-w-0 max-w-full rounded-md whitespace-normal break-all">
    <slot />
  </Badge>
</template>
