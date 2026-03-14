<script setup lang="ts">
import { useRouter } from "vue-router"
import { ElButton, ElEmpty } from "element-plus"

const router = useRouter()
</script>

<template>
  <section class="flex justify-center pt-20">
    <ElEmpty description="页面不存在" :image-size="120">
      <ElButton type="primary" @click="router.push('/holiday')">回到概览</ElButton>
    </ElEmpty>
  </section>
</template>
