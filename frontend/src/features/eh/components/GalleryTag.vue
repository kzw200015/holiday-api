<script setup lang="ts">
import { Badge } from "@/components/ui/badge"
</script>

<template>
  <Badge
    variant="secondary"
    class="h-auto min-w-0 max-w-full rounded-md px-1.5 py-0.5 text-xs whitespace-normal break-all"
  >
    <slot />
  </Badge>
</template>
