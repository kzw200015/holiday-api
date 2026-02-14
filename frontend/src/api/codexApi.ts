import { type ApiResponse, HttpClient } from "@/api/httpClient.ts"
import type { PaginatedResult } from "@/api/pagination.ts"

export type OAuthSessionInfo = {
  state: string
  url: string
  expiresAt: string
}

export type Account = {
  id: number
  name: string
  token: string
  enabled: boolean
  expiresAt: string
  createdAt: string
  updatedAt: string
  quota: CodexAccountQuota | null
}

export type CodexQuotaWindow = {
  usedPercent: number | null
  limitWindowSeconds: number | null
  resetAfterSeconds: number | null
  resetAt: number | null
}

export type CodexQuotaRateLimit = {
  allowed: boolean | null
  limitReached: boolean | null
  primaryWindow: CodexQuotaWindow | null
  secondaryWindow: CodexQuotaWindow | null
}

export type CodexQuotaAdditionalLimit = {
  limitName: string | null
  meteredFeature: string | null
  rateLimit: CodexQuotaRateLimit | null
}

export type CodexAccountQuota = {
  planType: string | null
  rateLimit: CodexQuotaRateLimit | null
  codeReviewRateLimit: CodexQuotaRateLimit | null
  additionalRateLimits: CodexQuotaAdditionalLimit[]
}

export type ResponseLogItem = {
  userAgent: string
  clientIp: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  cacheRate: number
  firstTokenLatencyMs: number
  durationMs: number
  accountName: string
  isSse: boolean
  createdAt: string
}

export type TodayTokenUsage = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  totalTokens: number
}

export type UpdateAccountRequest = {
  name: string
  enabled: boolean
}

export async function createCodexOAuthSession() {
  const { data } = await HttpClient.post<ApiResponse<OAuthSessionInfo>, ApiResponse<OAuthSessionInfo>>(
    "/codex/oauth/session",
  )
  return data
}

export async function completeCodexOAuth(name: string, redirectUrl: string) {
  const { data } = await HttpClient.post<ApiResponse<Account>, ApiResponse<Account>>(
    "/codex/oauth/complete",
    { name, redirectUrl },
  )
  return data
}

export async function listCodexAccounts(page: number, pageSize: number) {
  const { data } = await HttpClient.get<ApiResponse<PaginatedResult<Account>>, ApiResponse<PaginatedResult<Account>>>(
    "/codex/accounts",
    {
      params: {
        page,
        pageSize,
      },
    },
  )
  return data
}

export async function updateCodexAccount(id: number, req: UpdateAccountRequest) {
  const { data } = await HttpClient.put<ApiResponse<Account>, ApiResponse<Account>>(
    `/codex/accounts/${id}`,
    req,
  )
  return data
}

export async function listCodexResponseLogs(page: number, pageSize: number) {
  const { data } = await HttpClient.get<ApiResponse<PaginatedResult<ResponseLogItem>>, ApiResponse<PaginatedResult<ResponseLogItem>>>(
    "/codex/response-logs",
    {
      params: {
        page,
        pageSize,
      },
    },
  )
  return data
}

export async function getCodexTodayTokenUsage() {
  const { data } = await HttpClient.get<ApiResponse<TodayTokenUsage>, ApiResponse<TodayTokenUsage>>(
    "/codex/today-token-usage",
  )
  return data
}
