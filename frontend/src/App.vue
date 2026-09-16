<script setup lang="ts">
import { RouterView } from "vue-router"
</script>

<template>
  <!-- 阅读器全屏且不缓存；离开布局时仅停用布局内的页面。 -->
  <RouterView v-slot="{ Component }">
    <KeepAlive include="AppLayout">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
