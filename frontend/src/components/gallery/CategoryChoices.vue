<script setup lang="ts">
import { galleryCategories } from "@/api/eh"
import { Button } from "@/components/ui/button"

const selected = defineModel<string[]>({ required: true })
const emit = defineEmits<{ apply: [] }>()

function toggle(value: string) {
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
        class="min-h-11 rounded-md border px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :class="
          selected.includes(category.value) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'
        "
        :aria-pressed="selected.includes(category.value)"
        type="button"
        @click="toggle(category.value)"
      >
        {{ category.label }}
      </button>
    </div>
    <p class="text-muted-foreground text-xs">全不选或全选均表示不限分类。</p>
    <div class="flex justify-end gap-2">
      <Button variant="ghost" type="button" @click="selected = []">重置</Button>
      <Button type="button" @click="emit('apply')">应用</Button>
    </div>
  </div>
</template>
