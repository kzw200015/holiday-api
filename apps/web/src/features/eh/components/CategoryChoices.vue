<script setup lang="ts">
import type { GalleryCategory } from "@myapi/shared/eh"
import type { AcceptableValue } from "reka-ui"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { galleryCategories } from "@/features/eh/labels"

/* block：放在底部弹层里时两个按钮平分整行并用大号，离屏幕圆角远一些，拇指也好按。 */
defineProps<{ block?: boolean }>()
const selected = defineModel<GalleryCategory[]>({ required: true })
const emit = defineEmits<{ apply: [] }>()

/* 多选组回传的值不带分类类型，对着分类表认回来。 */
function isCategory(value: AcceptableValue): value is GalleryCategory {
  return galleryCategories.some((category) => category.value === value)
}

function select(next: AcceptableValue | AcceptableValue[]) {
  selected.value = Array.isArray(next) ? next.filter(isCategory) : []
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <ToggleGroup
      type="multiple"
      aria-label="分类"
      variant="outline"
      :spacing="2"
      class="grid w-full grid-cols-3"
      :model-value="selected"
      @update:model-value="select"
    >
      <ToggleGroupItem v-for="category in galleryCategories" :key="category.value" :value="category.value">
        {{ category.label }}
      </ToggleGroupItem>
    </ToggleGroup>
    <p class="text-muted-foreground text-xs">全不选或全选均表示不限分类。</p>
    <div :class="block ? 'grid grid-cols-2 gap-3' : 'flex justify-end gap-2'">
      <Button
        :size="block ? 'lg' : 'default'"
        :variant="block ? 'outline' : 'ghost'"
        type="button"
        @click="selected = []"
      >
        重置
      </Button>
      <Button :size="block ? 'lg' : 'default'" type="button" @click="emit('apply')">应用</Button>
    </div>
  </div>
</template>
