<script setup lang="ts">
import { ref, watch } from "vue"

/* 封面加载完才淡入，不让图片一行行刷出来；读不到就停在底色上，不露破图标。尺寸由调用方给。 */
const props = defineProps<{ src: string; lazy?: boolean }>()
const loaded = ref(false)
/* 详情页换图集时复用同一个实例，新封面同样从底色淡入。 */
watch(
  () => props.src,
  () => {
    loaded.value = false
  },
)
</script>

<template>
  <div class="bg-muted overflow-hidden rounded-lg">
    <img
      alt=""
      class="size-full object-cover transition-opacity duration-300 motion-reduce:transition-none"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      :loading="lazy ? 'lazy' : undefined"
      :src="src"
      @load="loaded = true"
    />
  </div>
</template>
