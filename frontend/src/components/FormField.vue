<script setup lang="ts">
import { Input } from "@/components/ui/input"

const {
  type = "text",
  placeholder = "",
  autocomplete = "off",
  labelClass = "",
} = defineProps<{
  id: string
  label: string
  type?: string
  placeholder?: string
  autocomplete?: string
  labelClass?: string
}>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="flex flex-col gap-2">
    <label class="text-sm font-medium" :class="labelClass" :for="id">{{ label }}</label>
    <Input
      :id="id"
      :model-value="model"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :type="type"
      @update:model-value="model = String($event)"
    />
  </div>
</template>
