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
        <!-- 触发它的按钮只是红字，到这一步才用实心红：真正动手的是这一下。 -->
        <AlertDialogAction
          variant="destructive"
          class="bg-destructive hover:bg-destructive/90 dark:bg-destructive/60 dark:hover:bg-destructive/50 cursor-pointer text-white"
          @click="emit('confirm')"
        >
          {{ confirmText }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
