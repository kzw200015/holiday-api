<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import type { GalleryCategory } from "@myapi/shared/eh"

import { Button } from "@/components/ui/button"
import { galleryCategories } from "@/features/eh/labels"

/* block：放在底部弹层里时两个按钮平分整行并加高，离屏幕圆角远一些，拇指也好按。 */
defineProps<{ block?: boolean }>()
const selected = defineModel<GalleryCategory[]>({ required: true })
const emit = defineEmits<{ apply: [] }>()

function toggle(value: GalleryCategory) {
  selected.value = selected.value.includes(value)
    ? selected.value.filter((item) => item !== value)
    : [...selected.value, value]
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="category in galleryCategories"
        :key="category.value"
        class="flex min-h-11 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring motion-safe:active:scale-95"
        :class="
          selected.includes(category.value) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'
        "
        :aria-pressed="selected.includes(category.value)"
        type="button"
        @click="toggle(category.value)"
      >
        <CheckIcon v-if="selected.includes(category.value)" class="size-3.5 shrink-0" />
        {{ category.label }}
      </button>
    </div>
    <p class="text-muted-foreground text-xs">全不选或全选均表示不限分类。</p>
    <div :class="block ? 'grid grid-cols-2 gap-3' : 'flex justify-end gap-2'">
      <Button :class="{ 'h-11': block }" :variant="block ? 'outline' : 'ghost'" type="button" @click="selected = []">
        重置
      </Button>
      <Button :class="{ 'h-11': block }" type="button" @click="emit('apply')">应用</Button>
    </div>
  </div>
</template>
