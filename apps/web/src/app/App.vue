<script setup lang="ts">
import { RouterView } from "vue-router"

import { readerInstanceKey } from "@/features/eh/navigation"
</script>

<template>
  <!-- 阅读器全屏且不缓存，并按图集重建；离开布局时仅停用布局内的页面。 -->
  <RouterView v-slot="{ Component, route }">
    <KeepAlive include="AppLayout">
      <component :is="Component" :key="readerInstanceKey(route)" />
    </KeepAlive>
  </RouterView>
</template>
