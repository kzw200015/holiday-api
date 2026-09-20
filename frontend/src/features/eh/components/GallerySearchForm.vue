<script setup lang="ts">
import { SearchIcon, XIcon } from "@lucide/vue"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import CategoryFilter from "@/features/eh/components/CategoryFilter.vue"
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue"
import EmptyState from "@/shared/components/EmptyState.vue"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"

defineProps<{
  categories: string[]
  disabled: boolean
  preferencesError: string
  history: { entries: string[]; loading: boolean; errorMessage: string }
}>()
const keyword = defineModel<string>("keyword", { required: true })
const emit = defineEmits<{
  submit: []
  applyCategories: [categories: string[]]
  selectHistory: [entry: string]
  removeHistory: [entry: string]
  clearHistory: []
}>()
</script>

<template>
  <div class="flex flex-col gap-3">
    <form @submit.prevent="emit('submit')">
      <fieldset class="flex min-w-0 flex-wrap gap-2" :disabled="disabled">
        <Input
          v-model="keyword"
          class="min-w-0 flex-1 basis-40"
          placeholder="搜索标题或标签，例如 language:chinese"
          aria-label="搜索图集"
        />
        <Button type="submit">
          <SearchIcon />
          搜索
        </Button>
        <CategoryFilter :selected="categories" @apply="emit('applyCategories', $event)" />
      </fieldset>
    </form>
    <ErrorAlert v-if="preferencesError" :message="preferencesError" title="偏好同步失败" />
    <ErrorAlert v-if="history.errorMessage" :message="history.errorMessage" title="历史同步失败" />
    <div class="flex flex-col gap-2" aria-label="搜索历史">
      <div class="text-muted-foreground flex items-center justify-between text-xs">
        <span>搜索历史</span>
        <ConfirmDialog
          v-if="history.entries.length"
          title="清空搜索历史？"
          description="清空会删除此账号在所有设备上共享的搜索历史，且无法恢复。确定继续吗？"
          confirm-text="清空历史"
          @confirm="emit('clearHistory')"
        >
          <Button variant="ghost" size="xs" class="cursor-pointer" type="button" :disabled="history.loading"
            >清空</Button
          >
        </ConfirmDialog>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <Badge
          v-for="entry in history.entries"
          :key="entry"
          as="span"
          variant="secondary"
          class="h-auto max-w-full gap-0 rounded-md p-0"
        >
          <Button
            variant="ghost"
            size="xs"
            class="min-w-0 shrink cursor-pointer rounded-r-none"
            type="button"
            :title="entry"
            :disabled="disabled"
            @click="emit('selectHistory', entry)"
          >
            <span class="truncate">{{ entry }}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            class="cursor-pointer rounded-l-none"
            :aria-label="`删除历史：${entry}`"
            :disabled="history.loading"
            type="button"
            @click="emit('removeHistory', entry)"
          >
            <XIcon class="size-3" />
          </Button>
        </Badge>
        <span v-if="history.loading" class="text-muted-foreground text-xs">正在同步搜索历史…</span>
        <EmptyState v-else-if="!history.entries.length && !history.errorMessage" compact message="暂无搜索历史" />
      </div>
    </div>
  </div>
</template>
