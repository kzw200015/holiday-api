<script setup lang="ts">
import { RouterView } from "vue-router"

import { useEhStore } from "@/stores/EhStore"

const ehStore = useEhStore()
</script>

<template>
  <RouterView v-slot="{ Component }">
    <!-- 列表与详情各保留一份；换图集复用详情，凭据变化则清空 EH 内部缓存。 -->
    <KeepAlive :key="ehStore.cacheRevision" :max="2">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
</template>
