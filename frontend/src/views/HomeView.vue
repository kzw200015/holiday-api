<script setup lang="ts">
import { RouterLink, useRouter } from "vue-router"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getNavigationItems } from "@/layouts/navigation"

const items = getNavigationItems(useRouter()).filter((item) => item.name !== "home")
</script>

<template>
  <div class="page-content grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <RouterLink v-for="item in items" :key="item.name" class="rounded-lg outline-offset-4" :to="{ name: item.name }">
      <Card class="hover:bg-accent/50 h-full transition-colors">
        <CardHeader>
          <component :is="item.icon" class="text-muted-foreground mb-2 size-6" />
          <CardTitle>{{ item.label }}</CardTitle>
          <CardDescription>{{ item.description }}</CardDescription>
        </CardHeader>
        <CardContent class="text-primary text-sm">进入{{ item.label }} →</CardContent>
      </Card>
    </RouterLink>
  </div>
</template>
