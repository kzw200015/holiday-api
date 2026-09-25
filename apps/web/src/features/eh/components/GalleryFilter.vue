<script setup lang="ts">
import { SlidersHorizontalIcon } from "@lucide/vue"
import { useMediaQuery } from "@vueuse/core"
import { computed, onDeactivated, ref, watch } from "vue"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import FilterChoices from "@/features/eh/components/FilterChoices.vue"
import { activeFilterCount, type GalleryFilters } from "@/features/eh/composables/useGalleryPreferences"

const props = defineProps<{ applied: GalleryFilters }>()
const emit = defineEmits<{ apply: [filters: GalleryFilters] }>()
const mobile = useMediaQuery("(max-width: 639px)")
const open = ref(false)
const draft = ref<GalleryFilters>({ categories: [], minRating: null })
const count = computed(() => activeFilterCount(props.applied))
/* 每次打开才从已应用条件建立草稿，关闭不提交。 */
watch(open, (value) => {
  if (value) {
    draft.value = { categories: [...props.applied.categories], minRating: props.applied.minRating }
  }
})
onDeactivated(() => {
  open.value = false
})

function apply() {
  emit("apply", { categories: [...draft.value.categories], minRating: draft.value.minRating })
  open.value = false
}
</script>

<template>
  <Sheet v-if="mobile" v-model:open="open">
    <SheetTrigger as-child>
      <Button variant="outline" type="button" aria-label="筛选">
        <SlidersHorizontalIcon />
        筛选{{ count ? ` (${count})` : "" }}
      </Button>
    </SheetTrigger>
    <!--
      底部留白给足：页面没开 viewport-fit=cover，env(safe-area-inset-bottom) 在手机上取到的是 0，
      只靠它的话按钮会贴进屏幕圆角和底部横条里。
    -->
    <SheetContent side="bottom" class="max-h-[85svh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <SheetHeader>
        <SheetTitle>筛选</SheetTitle>
        <SheetDescription>选好条件后点击应用。</SheetDescription>
      </SheetHeader>
      <FilterChoices v-model="draft" class="px-4" block @apply="apply" />
    </SheetContent>
  </Sheet>
  <Popover v-else v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" type="button" aria-label="筛选">
        <SlidersHorizontalIcon />
        筛选{{ count ? ` (${count})` : "" }}
      </Button>
    </PopoverTrigger>
    <!-- 默认的 w-72 放不下一行五档评分 -->
    <PopoverContent align="end" class="w-80" aria-label="筛选">
      <PopoverHeader>
        <PopoverTitle>筛选</PopoverTitle>
      </PopoverHeader>
      <FilterChoices v-model="draft" @apply="apply" />
    </PopoverContent>
  </Popover>
</template>
