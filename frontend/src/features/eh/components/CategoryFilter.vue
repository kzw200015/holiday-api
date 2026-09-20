<script setup lang="ts">
import { SlidersHorizontalIcon } from "@lucide/vue"
import { useMediaQuery } from "@vueuse/core"
import { onDeactivated, ref, watch } from "vue"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import CategoryChoices from "@/features/eh/components/CategoryChoices.vue"

const props = defineProps<{ selected: string[] }>()
const emit = defineEmits<{ apply: [categories: string[]] }>()
const mobile = useMediaQuery("(max-width: 639px)")
const open = ref(false)
const draft = ref<string[]>([])
/* 每次打开才从已应用条件建立草稿，关闭不提交。 */
watch(open, (value) => {
  if (value) {
    draft.value = [...props.selected]
  }
})
onDeactivated(() => {
  open.value = false
})

function apply() {
  emit("apply", [...draft.value])
  open.value = false
}
</script>

<template>
  <Sheet v-if="mobile" v-model:open="open">
    <SheetTrigger as-child>
      <Button variant="outline" type="button" aria-label="分类筛选">
        <SlidersHorizontalIcon />
        分类{{ selected.length ? ` (${selected.length})` : "" }}
      </Button>
    </SheetTrigger>
    <SheetContent
      side="bottom"
      class="max-h-[85svh] overflow-y-auto rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <SheetHeader class="p-0">
        <SheetTitle>分类筛选</SheetTitle>
        <SheetDescription>选择分类后点击应用。</SheetDescription>
      </SheetHeader>
      <CategoryChoices v-model="draft" @apply="apply" />
    </SheetContent>
  </Sheet>
  <Popover v-else v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" type="button" aria-label="分类筛选">
        <SlidersHorizontalIcon />
        分类{{ selected.length ? ` (${selected.length})` : "" }}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" :side-offset="8" class="w-80 p-4" aria-label="分类筛选">
      <PopoverHeader>
        <PopoverTitle>分类筛选</PopoverTitle>
      </PopoverHeader>
      <CategoryChoices v-model="draft" @apply="apply" />
    </PopoverContent>
  </Popover>
</template>
