<script setup lang="ts">
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import { Calendar } from "@element-plus/icons-vue"
import { ElIcon, ElMenu, ElMenuItem } from "element-plus"

type NavItem = {
  path: string
  label: string
  icon: typeof Calendar
}

/* 侧栏导航项配置 */
const navItems: NavItem[] = [
  { path: "/holiday", label: "节假日", icon: Calendar },
]

withDefaults(defineProps<{
  collapsed?: boolean
}>(), {
  collapsed: false,
})

const emit = defineEmits<{
  menuSelect: []
}>()

const route = useRoute()
const router = useRouter()
const activePath = computed(() => route.path)

const handleSelect = async (index: string) => {
  await router.push(index)
  emit("menuSelect")
}
</script>

<template>
  <div class="h-full">
    <ElMenu
      class="border-r-0 bg-transparent"
      :collapse="collapsed"
      :default-active="activePath"
      @select="handleSelect"
    >
      <ElMenuItem v-for="item in navItems" :key="item.path" :index="item.path">
        <ElIcon>
          <component :is="item.icon" />
        </ElIcon>
        <span>{{ item.label }}</span>
      </ElMenuItem>
    </ElMenu>
  </div>
</template>
