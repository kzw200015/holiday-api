import { type ApiResponse, HttpClient } from "@/api/httpClient.ts"
import type { PaginatedResult } from "@/api/pagination.ts"

export type OAuthSessionInfo = {
    state: string
    url: string
    expiresAt: string
}

export type Account = {
    name: string
    accountId: string
    token: string
    expiresAt: string
    createdAt: string
    updatedAt: string
}

export type ResponseLogItem = {
    userAgent: string
    clientIp: string
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    cacheRate: number
    durationMs: number
    accountId: string
    accountName: string
    isSse: boolean
    createdAt: string
}

export type UpdateAccountRequest = {
    name: string
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

export async function updateCodexAccount(accountId: string, req: UpdateAccountRequest) {
    const { data } = await HttpClient.put<ApiResponse<Account>, ApiResponse<Account>>(
        `/codex/accounts/${accountId}`,
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
