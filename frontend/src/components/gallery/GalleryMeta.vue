<script setup lang="ts">
import { StarIcon } from "@lucide/vue"
import { clamp } from "@vueuse/core"
import { computed } from "vue"

import { categoryLabels } from "@/api/eh"
import { Badge } from "@/components/ui/badge"

const props = defineProps<{ category: string; rating: number; compact?: boolean }>()
/* 保留小数评分；文案与五星填充共用合法范围内的值。 */
const rating = computed(() => clamp(props.rating, 0, 5))
const label = computed(() => `评分 ${rating.value.toFixed(2)} / 5`)
const starWidths = computed(() =>
  Array.from({ length: 5 }, (_, index) => `${Math.round(clamp(rating.value - index, 0, 1) * 10000) / 100}%`),
)
</script>

<template>
  <Badge variant="secondary">{{ categoryLabels[category] ?? category }}</Badge>
  <span class="inline-flex shrink-0 items-center gap-0.5" role="img" :aria-label="label" :title="label">
    <span
      v-for="(width, index) in starWidths"
      :key="index"
      class="relative block"
      :class="compact ? 'size-3' : 'size-3.5'"
      aria-hidden="true"
    >
      <StarIcon class="text-muted-foreground/50 size-full" />
      <span class="absolute inset-y-0 left-0 overflow-hidden text-amber-500 dark:text-amber-400" :style="{ width }">
        <StarIcon :class="compact ? 'size-3' : 'size-3.5'" fill="currentColor" />
      </span>
    </span>
  </span>
</template>
