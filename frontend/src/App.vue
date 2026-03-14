<script setup lang="ts">
import { RouterView } from "vue-router"
import { ElConfigProvider } from "element-plus"
import zhCn from "element-plus/es/locale/lang/zh-cn"
</script>

<template>
  <!-- Element Plus 组件默认中文（日期、分页、空状态等内置文案） -->
  <ElConfigProvider :locale="zhCn">
    <RouterView />
  </ElConfigProvider>
</template>
