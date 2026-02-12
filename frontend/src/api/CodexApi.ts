import { type ApiResponse, HttpClient } from "@/api/HttpClient"

export type CodexOAuthSession = {
    state: string
    url: string
    expiresAt: string
}

export type CodexAccount = {
    accountId: string
    token: string
    expiresAt: string
    createdAt: string
    updatedAt: string
}

export async function createCodexOAuthSession() {
    const { data } = await HttpClient.post<ApiResponse<CodexOAuthSession>, ApiResponse<CodexOAuthSession>>(
        "/codex/oauth/session",
    )
    return data
}

export async function completeCodexOAuth(redirectUrl: string) {
    const { data } = await HttpClient.post<ApiResponse<CodexAccount>, ApiResponse<CodexAccount>>(
        "/codex/oauth/complete",
        { redirectUrl },
    )
    return data
}

export async function listCodexAccounts() {
    const { data } = await HttpClient.get<ApiResponse<CodexAccount[]>, ApiResponse<CodexAccount[]>>(
        "/codex/accounts",
    )
    return data
}
