<script setup lang="ts">
import { RefreshCwIcon } from "@lucide/vue"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useTagTranslations } from "@/features/eh/composables/useTagTranslations"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"
import { formatDateTime } from "@/shared/lib/format"

/* 标签译名的状态与手动同步，放在设置页里。 */
const { status, loading, loadError, syncing, errorMessage, reload, sync } = useTagTranslations()
/* 设置页的刷新按钮要连这张卡片一起重读 */
defineExpose({ reload })
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>标签译名</CardTitle>
      <!-- 译名数据按 CC BY-NC-SA 协议使用，要署名。 -->
      <CardDescription>
        标签的中文名来自
        <a
          class="text-primary underline underline-offset-2"
          href="https://github.com/EhTagTranslation/Database"
          rel="noreferrer noopener"
          target="_blank"
          >EhTagTranslation</a
        >
        社区，按 CC BY-NC-SA 3.0 协议使用。上游随时在更新，想用上新的译名就同步一次；没有译名的标签显示原文。
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <Skeleton v-if="loading" class="h-5 w-64" />
      <ErrorAlert v-else-if="loadError" :message="loadError" title="状态加载失败" retryable @retry="reload" />
      <template v-else>
        <p v-if="status?.lastSync" class="text-sm">
          共 {{ status.lastSync.count }} 条 · 版本 <code>{{ status.lastSync.sha.slice(0, 7) }}</code> · 同步于
          {{ formatDateTime(status.lastSync.syncedAt) }}
        </p>
        <p v-else class="text-muted-foreground text-sm">尚未同步，标签都显示原文。</p>
        <ErrorAlert v-if="errorMessage" :message="errorMessage" title="同步失败" />
        <div>
          <Button variant="outline" :disabled="syncing" @click="sync">
            <RefreshCwIcon />
            {{ syncing ? "同步中…" : "同步" }}
          </Button>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
