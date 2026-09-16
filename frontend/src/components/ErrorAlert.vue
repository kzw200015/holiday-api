<script setup lang="ts">
import { CircleAlertIcon } from "@lucide/vue"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

defineProps<{ title: string; message: string; retryable?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <Alert variant="destructive">
    <CircleAlertIcon />
    <AlertTitle>{{ title }}</AlertTitle>
    <AlertDescription class="flex flex-col items-start gap-2">
      <span>{{ message }}</span>
      <Button v-if="retryable" size="sm" variant="outline" type="button" @click="emit('retry')">重试</Button>
      <slot />
    </AlertDescription>
  </Alert>
</template>
