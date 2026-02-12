import { type ApiResponse, HttpClient } from "@/api/HttpClient"

export type CodexOAuthSession = {
    state: string
    url: string
    expiresAt: string
}

export type CodexAccount = {
    name: string
    accountId: string
    token: string
    expiresAt: string
    createdAt: string
    updatedAt: string
}

export type CodexAccountsPage = {
    items: CodexAccount[]
    total: number
    page: number
    pageSize: number
}

export type UpdateCodexAccountRequest = {
    name: string
}

export async function createCodexOAuthSession() {
    const { data } = await HttpClient.post<ApiResponse<CodexOAuthSession>, ApiResponse<CodexOAuthSession>>(
        "/codex/oauth/session",
    )
    return data
}

export async function completeCodexOAuth(name: string, redirectUrl: string) {
    const { data } = await HttpClient.post<ApiResponse<CodexAccount>, ApiResponse<CodexAccount>>(
        "/codex/oauth/complete",
        { name, redirectUrl },
    )
    return data
}

export async function listCodexAccounts(page: number, pageSize: number) {
    const { data } = await HttpClient.get<ApiResponse<CodexAccountsPage>, ApiResponse<CodexAccountsPage>>(
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

export async function updateCodexAccount(accountId: string, req: UpdateCodexAccountRequest) {
    const { data } = await HttpClient.put<ApiResponse<CodexAccount>, ApiResponse<CodexAccount>>(
        `/codex/accounts/${accountId}`,
        req,
    )
    return data
}
