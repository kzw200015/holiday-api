<script setup lang="ts">
import { SearchIcon, XIcon } from "@lucide/vue"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Input } from "@/components/ui/input"
import GalleryFilter from "@/features/eh/components/GalleryFilter.vue"
import type { GalleryFilters } from "@/features/eh/composables/useGalleryPreferences"
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue"
import EmptyState from "@/shared/components/EmptyState.vue"

defineProps<{ filters: GalleryFilters; history: string[] }>()
const keyword = defineModel<string>("keyword", { required: true })
const emit = defineEmits<{
  submit: []
  applyFilters: [filters: GalleryFilters]
  selectHistory: [entry: string]
  removeHistory: [entry: string]
  clearHistory: []
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <form class="flex min-w-0 flex-wrap gap-2" @submit.prevent="emit('submit')">
      <Input
        v-model="keyword"
        class="flex-1 basis-40"
        placeholder="搜索标题或标签，例如 language:chinese"
        aria-label="搜索图集"
      />
      <Button type="submit">
        <SearchIcon />
        搜索
      </Button>
      <GalleryFilter :applied="filters" @apply="emit('applyFilters', $event)" />
    </form>
    <div class="flex flex-col gap-2" aria-label="搜索历史">
      <div class="text-muted-foreground flex items-center justify-between text-xs">
        <span>搜索历史</span>
        <ConfirmDialog
          v-if="history.length"
          title="清空搜索历史？"
          description="清空会删除此账号在所有设备上共享的搜索历史，且无法恢复。确定继续吗？"
          confirm-text="清空历史"
          @confirm="emit('clearHistory')"
        >
          <Button variant="destructive" size="xs" type="button">清空</Button>
        </ConfirmDialog>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <!-- 长词在按钮里截断：组要能收窄到一行宽，按钮也要能跟着缩。 -->
        <ButtonGroup v-for="entry in history" :key="entry" class="max-w-full">
          <Button
            variant="secondary"
            size="xs"
            class="min-w-0 shrink"
            type="button"
            :title="entry"
            @click="emit('selectHistory', entry)"
          >
            <span class="truncate">{{ entry }}</span>
          </Button>
          <Button
            variant="secondary"
            size="icon-xs"
            :aria-label="`删除历史：${entry}`"
            type="button"
            @click="emit('removeHistory', entry)"
          >
            <XIcon />
          </Button>
        </ButtonGroup>
        <EmptyState v-if="!history.length" compact message="暂无搜索历史" />
      </div>
    </div>
  </div>
</template>
