<script setup lang="ts">
import type { GalleryCategory } from "@myapi/shared/eh"
import type { AcceptableValue } from "reka-ui"
import { computed } from "vue"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { GalleryFilters } from "@/features/eh/composables/useGalleryPreferences"
import { galleryCategories, minRatingOptions } from "@/features/eh/labels"

/* block：放在底部弹层里时两个按钮平分整行并用大号，离屏幕圆角远一些，拇指也好按。 */
defineProps<{ block?: boolean }>()
const selected = defineModel<GalleryFilters>({ required: true })
const emit = defineEmits<{ apply: [] }>()

/* 多选组回传的值不带分类类型，对着分类表认回来。 */
function isCategory(value: AcceptableValue): value is GalleryCategory {
  return galleryCategories.some((category) => category.value === value)
}

function selectCategories(next: AcceptableValue | AcceptableValue[]) {
  selected.value = { ...selected.value, categories: Array.isArray(next) ? next.filter(isCategory) : [] }
}

/* 单选组按选项的文案认值：「不限」是 null，放不进组的取值里。 */
const ratingLabel = computed(
  () => minRatingOptions.find((option) => option.value === selected.value.minRating)?.label ?? "",
)

/* 再点一下已选的那档，单选组会回传空值；评分总得落在某一档上，照旧不变。 */
function selectRating(next: AcceptableValue | AcceptableValue[]) {
  const option = minRatingOptions.find((candidate) => candidate.label === next)
  if (option) {
    selected.value = { ...selected.value, minRating: option.value }
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium">分类</p>
      <ToggleGroup
        type="multiple"
        aria-label="分类"
        variant="outline"
        :spacing="2"
        class="grid w-full grid-cols-3"
        :model-value="selected.categories"
        @update:model-value="selectCategories"
      >
        <ToggleGroupItem v-for="category in galleryCategories" :key="category.value" :value="category.value">
          {{ category.label }}
        </ToggleGroupItem>
      </ToggleGroup>
      <p class="text-muted-foreground text-xs">全不选或全选均表示不限分类。</p>
    </div>
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium">最低评分</p>
      <ToggleGroup
        type="single"
        aria-label="最低评分"
        variant="outline"
        :spacing="2"
        class="grid w-full grid-cols-5"
        :model-value="ratingLabel"
        @update:model-value="selectRating"
      >
        <ToggleGroupItem v-for="option in minRatingOptions" :key="option.label" :value="option.label">
          {{ option.label }}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
    <div :class="block ? 'grid grid-cols-2 gap-3' : 'flex justify-end gap-2'">
      <Button
        :size="block ? 'lg' : 'default'"
        :variant="block ? 'outline' : 'ghost'"
        type="button"
        @click="selected = { categories: [], minRating: null }"
      >
        重置
      </Button>
      <Button :size="block ? 'lg' : 'default'" type="button" @click="emit('apply')">应用</Button>
    </div>
  </div>
</template>
