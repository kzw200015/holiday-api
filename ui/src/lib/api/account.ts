import type { AxiosError } from "axios"

import { http } from "@/lib/http"

/**
 * 后端通用响应结构：ApiResponse<T>
 */
export type ApiResponse<T> = {
    code: number
    data: T
    msg: string
}

type ApiError = AxiosError<ApiResponse<unknown>>

function resolveApiErrorMessage(error: unknown) {
    if (typeof error === "object" && error) {
        const axiosError = error as ApiError
        const msg = axiosError.response?.data?.msg
        if (msg) {
            return msg
        }
    }
    return error instanceof Error ? error.message : String(error)
}

export type AccountListItem = {
    id: string
    name: string
    authType: string
    createTime: string
}

export type AccountDetail = AccountListItem & {
    oauthJson: unknown
}

/**
 * 获取账号列表。
 *
 * GET /api/account/list
 */
export async function listAccounts() {
    try {
        const response = await http.get<ApiResponse<AccountListItem[]>>("/account/list")
        return response.data.data
    } catch (error) {
        throw new Error(resolveApiErrorMessage(error))
    }
}

/**
 * 获取账号详情。
 *
 * GET /api/account/{id}
 */
export async function getAccountDetail(id: string) {
    try {
        const response = await http.get<ApiResponse<AccountDetail>>(`/account/${id}`)
        return response.data.data
    } catch (error) {
        throw new Error(resolveApiErrorMessage(error))
    }
}

/**
 * 更新账号名称。
 *
 * PUT /api/account/{id}
 */
export async function updateAccountName(id: string, name: string) {
    try {
        await http.put<ApiResponse<null>>(`/account/${id}`, { name })
    } catch (error) {
        throw new Error(resolveApiErrorMessage(error))
    }
}

/**
 * 删除账号。
 *
 * DELETE /api/account/{id}
 */
export async function deleteAccount(id: string) {
    try {
        await http.delete<ApiResponse<null>>(`/account/${id}`)
    } catch (error) {
        throw new Error(resolveApiErrorMessage(error))
    }
}

export type CodexAuthorizeUrlResult = {
    authorizeUrl: string
    state: string
    redirectUri: string
    expiresAt: string
}

/**
 * 获取 Codex OAuth 授权链接。
 *
 * GET /api/codex/oauth2/authorize-url
 */
export async function getCodexAuthorizeUrl() {
    try {
        const response = await http.get<ApiResponse<CodexAuthorizeUrlResult>>("/codex/oauth2/authorize-url")
        return response.data.data
    } catch (error) {
        throw new Error(resolveApiErrorMessage(error))
    }
}

export type CodexCompleteResult = {
    accessToken: string
    refreshToken: string
    idToken: string
    expiresInSeconds: number | null
    accountId: string
}

/**
 * 完成 Codex OAuth 授权（并在后端创建账号记录）。
 *
 * POST /api/codex/oauth2/complete
 */
export async function completeCodexOAuth(callbackUrl: string, name: string) {
    try {
        const response = await http.post<ApiResponse<CodexCompleteResult>>("/codex/oauth2/complete", {
            callbackUrl,
            name,
        })
        return response.data.data
    } catch (error) {
        throw new Error(resolveApiErrorMessage(error))
    }
}
