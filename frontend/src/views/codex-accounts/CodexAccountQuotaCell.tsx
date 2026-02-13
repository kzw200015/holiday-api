import { defineComponent, ref, watch } from "vue"
import { ElText } from "element-plus"

import { getCodexAccountQuota, type CodexAccountQuota } from "@/api/codexApi.ts"

type SimpleQuotaWindow = {
  remainingPercent: number | null
  resetAfterSeconds: number | null
}

export type CodexAccountQuotaCellExposed = {
  fetchQuota: () => Promise<boolean>
  reset: () => void
}

function resolveRemainingPercent(usedPercent: number | null) {
  if (usedPercent === null) {
    return null
  }
  const remaining = 100 - usedPercent
  if (remaining < 0) {
    return 0
  }
  if (remaining > 100) {
    return 100
  }
  return remaining
}

function resolveSimpleWindows(quota: CodexAccountQuota) {
  const rateLimit = quota.rateLimit
  if (!rateLimit) {
    return { fiveHour: null, sevenDay: null }
  }

  const primary = rateLimit.primaryWindow
  const secondary = rateLimit.secondaryWindow
  const primarySeconds = primary?.limitWindowSeconds
  const secondarySeconds = secondary?.limitWindowSeconds

  if (primarySeconds === 18000 || secondarySeconds === 604800) {
    return {
      fiveHour: primary,
      sevenDay: secondary,
    }
  }
  if (primarySeconds === 604800 || secondarySeconds === 18000) {
    return {
      fiveHour: secondary,
      sevenDay: primary,
    }
  }

  return {
    fiveHour: primary,
    sevenDay: secondary,
  }
}

function toSimpleQuotaWindow(window: {
  usedPercent: number | null
  resetAfterSeconds: number | null
} | null): SimpleQuotaWindow {
  if (!window) {
    return {
      remainingPercent: null,
      resetAfterSeconds: null,
    }
  }
  return {
    remainingPercent: resolveRemainingPercent(window.usedPercent),
    resetAfterSeconds: window.resetAfterSeconds,
  }
}

function formatCompactReset(resetAfterSeconds: number | null) {
  if (resetAfterSeconds === null) {
    return "-"
  }
  if (resetAfterSeconds <= 0) {
    return "0m"
  }
  const day = Math.floor(resetAfterSeconds / 86400)
  const hour = Math.floor((resetAfterSeconds % 86400) / 3600)
  const minute = Math.floor((resetAfterSeconds % 3600) / 60)
  if (day > 0) {
    return `${day}d ${hour}h`
  }
  if (hour > 0) {
    return `${hour}h ${minute}m`
  }
  if (minute > 0) {
    return `${minute}m`
  }
  return "<1m"
}

function renderSimpleQuotaRow(label: "5h" | "7d", window: SimpleQuotaWindow) {
  const remainingPercent = window.remainingPercent
  const barWidth = remainingPercent === null ? 0 : Math.round(remainingPercent)
  const percentText = remainingPercent === null ? "-" : `${Math.round(remainingPercent)}%`
  const resetText = formatCompactReset(window.resetAfterSeconds)
  const badgeClass =
    label === "5h"
      ? "rounded-lg bg-[#e7ecff] px-2 py-1 text-xs font-semibold text-[#3f5bd8]"
      : "rounded-lg bg-[#daf3e8] px-2 py-1 text-xs font-semibold text-[#2f8a60]"

  return (
    <div class="flex items-center gap-2">
      <span class={badgeClass}>{label}</span>
      <div class="h-2 w-20 overflow-hidden rounded bg-[var(--el-fill-color-dark)]">
        <div class="h-full rounded bg-[#4caf6f]" style={{ width: `${barWidth}%` }}/>
      </div>
      <ElText class="text-xs font-semibold tabular-nums text-[var(--el-text-color-primary)]">{percentText}</ElText>
      <ElText class="text-xs tabular-nums text-[var(--el-text-color-secondary)]">{resetText}</ElText>
    </div>
  )
}

export default defineComponent({
  name: "CodexAccountQuotaCell",
  props: {
    accountId: {
      type: Number,
      required: true,
    },
  },
  setup(props, { expose }) {
    const status = ref<"idle" | "loading" | "success" | "error">("idle")
    const quota = ref<CodexAccountQuota | null>(null)
    const error = ref("")

    const reset = () => {
      status.value = "idle"
      quota.value = null
      error.value = ""
    }

    const fetchQuota = async () => {
      status.value = "loading"
      quota.value = null
      error.value = ""
      try {
        quota.value = await getCodexAccountQuota(props.accountId)
        status.value = "success"
        return true
      } catch (err) {
        status.value = "error"
        error.value = err instanceof Error ? err.message : "获取失败"
        return false
      }
    }

    watch(
      () => props.accountId,
      () => {
        reset()
      },
    )

    expose<CodexAccountQuotaCellExposed>({
      fetchQuota,
      reset,
    })

    return () => {
      if (status.value === "idle") {
        return <ElText class="text-sm text-[var(--el-text-color-secondary)]">未获取</ElText>
      }
      if (status.value === "loading") {
        return <ElText class="text-sm text-[var(--el-color-primary)]">获取中...</ElText>
      }
      if (status.value === "error") {
        return <ElText class="text-sm text-[var(--el-color-danger)]">{error.value || "获取失败"}</ElText>
      }
      if (!quota.value) {
        return <ElText class="text-sm text-[var(--el-text-color-secondary)]">暂无数据</ElText>
      }

      const windows = resolveSimpleWindows(quota.value)
      const fiveHour = toSimpleQuotaWindow(windows.fiveHour)
      const sevenDay = toSimpleQuotaWindow(windows.sevenDay)
      return (
        <div class="flex flex-col gap-2 py-1">
          {renderSimpleQuotaRow("5h", fiveHour)}
          {renderSimpleQuotaRow("7d", sevenDay)}
        </div>
      )
    }
  },
})
