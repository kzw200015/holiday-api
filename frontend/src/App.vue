<script setup lang="ts">
import { provide } from "vue"
import { RouterView } from "vue-router"

import { createGalleryNavigation, galleryNavigationKey } from "@/composables/galleryNavigation"

provide(galleryNavigationKey, createGalleryNavigation())
</script>

<template>
  <!-- 阅读器全屏且不缓存；离开布局时仅停用布局内的页面。 -->
  <RouterView v-slot="{ Component }">
    <KeepAlive include="AppLayout">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
