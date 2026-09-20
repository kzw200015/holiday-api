<script setup lang="ts">
defineProps<{ message: string; compact?: boolean }>()
</script>

<template>
  <p role="status" class="text-muted-foreground text-sm" :class="compact ? 'py-2' : 'py-12 text-center'">
    {{ message }}
  </p>
</template>
