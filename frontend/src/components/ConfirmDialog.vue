<script setup lang="ts">
import { onDeactivated, ref } from "vue"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const { confirmText = "确认" } = defineProps<{ title: string; description: string; confirmText?: string }>()
const emit = defineEmits<{ confirm: [] }>()
const open = ref(false)
onDeactivated(() => {
  open.value = false
})
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogTrigger as-child>
      <slot />
    </AlertDialogTrigger>
    <AlertDialogContent class="w-[calc(100%-2rem)]">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel class="cursor-pointer">取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive" class="cursor-pointer" @click="emit('confirm')">
          {{ confirmText }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
