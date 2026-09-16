<script setup lang="ts">
import { SearchIcon, XIcon } from "@lucide/vue"
import { onActivated, onDeactivated, onScopeDispose, ref } from "vue"

import { clearSearchHistory, fetchSearchHistory, recordSearch, removeSearch, type GallerySearch } from "@/api/eh"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import EmptyState from "@/components/EmptyState.vue"
import ErrorAlert from "@/components/ErrorAlert.vue"
import CategoryFilter from "@/components/gallery/CategoryFilter.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useGalleryPreferences } from "@/composables/useGalleryPreferences"

/* 恢复条件不提交输入草稿，也不要求列表无条件回到顶部。 */
const emit = defineEmits<{ search: [query: GallerySearch]; restore: [query: GallerySearch] }>()
const {
  categories: selected,
  loading: preferencesLoading,
  savingCategories,
  errorMessage: preferencesError,
  load: loadPreferences,
  applyCategories: apply,
} = useGalleryPreferences()
const keyword = ref("")
let submittedKeyword = ""
let active = true

const entries = ref<string[]>([])
const historyLoading = ref(false)
const historyError = ref("")
let historyRevision = 0
const historyController = new AbortController()

/* 历史按操作提交，去重与数量上限由服务端负责；旧响应不能覆盖后续操作的结果。 */
async function updateHistory(request: () => Promise<string[]>, failureMessage: string) {
  const revision = ++historyRevision
  historyLoading.value = true
  historyError.value = ""
  try {
    const history = await request()
    if (revision === historyRevision) {
      entries.value = history
    }
  } catch {
    if (revision === historyRevision) {
      historyError.value = failureMessage
    }
  } finally {
    if (revision === historyRevision) {
      historyLoading.value = false
    }
  }
}

function removeHistory(entry: string) {
  void updateHistory(() => removeSearch(entry), "删除搜索历史失败，请重试。")
}

function clearHistory() {
  void updateHistory(async () => {
    await clearSearchHistory()
    return []
  }, "清空搜索历史失败，请重试。")
}

async function restorePreferences() {
  void updateHistory(() => fetchSearchHistory(historyController.signal), "读取搜索历史失败。")
  await loadPreferences()
  if (active && !preferencesLoading.value) {
    emit("restore", { keyword: submittedKeyword, categories: selected.value })
  }
}

onActivated(() => {
  active = true
  void restorePreferences()
})
onDeactivated(() => {
  active = false
})
onScopeDispose(() => {
  active = false
  historyRevision += 1
  historyController.abort()
})

function runSearch() {
  keyword.value = keyword.value.trim()
  submittedKeyword = keyword.value
  if (submittedKeyword) {
    const entry = submittedKeyword
    void updateHistory(() => recordSearch(entry), "搜索历史保存失败，本次关键词未确认保存。")
  }
  emit("search", { keyword: submittedKeyword, categories: selected.value })
}

function applyCategories(categories: string[]) {
  void apply(categories)
  runSearch()
}

function searchHistory(entry: string) {
  keyword.value = entry
  runSearch()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <form @submit.prevent="runSearch">
      <fieldset class="flex min-w-0 flex-wrap gap-2" :disabled="preferencesLoading || savingCategories">
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
        <CategoryFilter :selected="selected" @apply="applyCategories" />
      </fieldset>
    </form>
    <ErrorAlert v-if="preferencesError" :message="preferencesError" title="偏好同步失败" />
    <ErrorAlert v-if="historyError" :message="historyError" title="历史同步失败" />
    <div class="flex flex-col gap-2" aria-label="搜索历史">
      <div class="text-muted-foreground flex items-center justify-between text-xs">
        <span>搜索历史</span>
        <ConfirmDialog
          v-if="entries.length"
          title="清空搜索历史？"
          description="清空会删除此账号在所有设备上共享的搜索历史，且无法恢复。确定继续吗？"
          confirm-text="清空历史"
          @confirm="clearHistory"
        >
          <Button variant="ghost" size="xs" class="cursor-pointer" type="button" :disabled="historyLoading"
            >清空</Button
          >
        </ConfirmDialog>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <Badge
          v-for="entry in entries"
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
            :disabled="preferencesLoading || savingCategories"
            @click="searchHistory(entry)"
          >
            <span class="truncate">{{ entry }}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            class="cursor-pointer rounded-l-none"
            :aria-label="`删除历史：${entry}`"
            :disabled="historyLoading"
            type="button"
            @click="removeHistory(entry)"
          >
            <XIcon class="size-3" />
          </Button>
        </Badge>
        <span v-if="historyLoading" class="text-muted-foreground text-xs">正在同步搜索历史…</span>
        <EmptyState v-else-if="!entries.length && !historyError" compact message="暂无搜索历史" />
      </div>
    </div>
  </div>
</template>
