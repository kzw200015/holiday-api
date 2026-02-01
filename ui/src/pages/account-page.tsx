import { useEffect, useState } from "react"
import dayjs from "dayjs"
import { Key, Pencil, RefreshCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
    type AccountDetail,
    type AccountListItem,
    completeCodexOAuth,
    deleteAccount,
    getAccountDetail,
    getCodexAuthorizeUrl,
    listAccounts,
    updateAccountName,
} from "@/lib/api/account"

function formatTime(timeText: string) {
    const d = dayjs(timeText)
    if (!d.isValid()) {
        return timeText
    }
    return d.format("YYYY-MM-DD HH:mm:ss")
}

type AccountCreateDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onChanged: () => Promise<void> | void
}

function AccountCreateDialog({ open, onOpenChange, onChanged }: AccountCreateDialogProps) {
    const [loading, setLoading] = useState(false)

    const [oauthName, setOauthName] = useState("")
    const [oauthCallbackUrl, setOauthCallbackUrl] = useState("")
    const [authorizeUrl, setAuthorizeUrl] = useState<string>()
    const [authorizeMeta, setAuthorizeMeta] = useState<string>()

    function reset() {
        setOauthName("")
        setOauthCallbackUrl("")
        setAuthorizeUrl(undefined)
        setAuthorizeMeta(undefined)
    }

    useEffect(() => {
        if (!open) {
            setLoading(false)
            reset()
        }
    }, [open])

    async function loadAuthorizeUrl() {
        setLoading(true)
        try {
            const result = await getCodexAuthorizeUrl()
            setAuthorizeUrl(result.authorizeUrl)
            setAuthorizeMeta(`redirectUri=${result.redirectUri} · expiresAt=${formatTime(result.expiresAt)}`)
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }

    async function completeOauth() {
        setLoading(true)
        try {
            await completeCodexOAuth(oauthCallbackUrl, oauthName)
            toast("账号创建成功")
            await onChanged()
            onOpenChange(false)
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>新增账号</DialogTitle>
                    <DialogDescription>
                        {"生成授权链接 -> 浏览器完成授权 -> 复制地址栏回调 URL -> 粘贴并完成创建。"}
                    </DialogDescription>
                </DialogHeader>

                <FieldGroup className="gap-4">
                    <Field>
                        <FieldLabel htmlFor="oauth-account-name">账号名称</FieldLabel>
                        <Input
                            id="oauth-account-name"
                            value={oauthName}
                            onChange={(e) => setOauthName(e.target.value)}
                            placeholder="例如：工作号 / 个人号"
                        />
                        <FieldDescription>用于在列表中区分不同账号。</FieldDescription>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="oauth-callback-url">回调 URL</FieldLabel>
                        <Textarea
                            id="oauth-callback-url"
                            value={oauthCallbackUrl}
                            onChange={(e) => setOauthCallbackUrl(e.target.value)}
                            placeholder="粘贴浏览器回调地址（含 code/state）"
                            className="h-24 resize-none font-mono text-xs"
                        />
                        <FieldDescription>从浏览器地址栏复制完整回调 URL（含 query 参数）。</FieldDescription>
                    </Field>
                </FieldGroup>

                <div className="rounded-lg border bg-secondary/20 p-4 text-sm">
                    <div className="font-medium text-foreground">流程</div>
                    <div className="mt-2 space-y-2 text-muted-foreground">
                        <div>1) 获取授权链接并打开浏览器完成登录授权</div>
                        <div>2) 授权完成后浏览器会跳转，复制地址栏完整回调 URL</div>
                        <div>3) 把回调 URL 粘贴到上方，然后点击“完成并创建”</div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={loadAuthorizeUrl} disabled={loading}>
                            {authorizeUrl ? "重新获取授权链接" : "获取授权链接"}
                        </Button>
                        <Button
                            variant="outline"
                            disabled={!authorizeUrl}
                            onClick={() => {
                                if (authorizeUrl) {
                                    window.open(authorizeUrl, "_blank", "noopener,noreferrer")
                                }
                            }}
                        >
                            打开授权页面
                        </Button>
                    </div>

                    {authorizeUrl ? (
                        <div className="mt-3 break-all text-xs">
                            <div className="text-muted-foreground">{authorizeMeta}</div>
                            <a
                                className="mt-2 inline-block underline-offset-4 hover:underline"
                                href={authorizeUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {authorizeUrl}
                            </a>
                        </div>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
                        取消
                    </Button>
                    <Button onClick={completeOauth} disabled={loading}>
                        {loading ? "处理中…" : "完成并创建"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

type AccountEditDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    accountId?: string
    onChanged: () => Promise<void> | void
}

function AccountEditDialog({ open, onOpenChange, accountId, onChanged }: AccountEditDialogProps) {
    const [loading, setLoading] = useState(false)

    const [detailLoading, setDetailLoading] = useState(false)
    const [detail, setDetail] = useState<AccountDetail>()
    const [detailName, setDetailName] = useState("")
    const [detailOauthJsonText, setDetailOauthJsonText] = useState("")

    useEffect(() => {
        if (!open) {
            setLoading(false)
            setDetailLoading(false)
            setDetail(undefined)
            setDetailName("")
            setDetailOauthJsonText("")
            return
        }

        setLoading(false)

        if (!accountId) {
            setDetail(undefined)
            setDetailName("")
            setDetailOauthJsonText("")
            setDetailLoading(false)
            return
        }

        void (async () => {
            setDetailLoading(true)
            try {
                const data = await getAccountDetail(accountId)
                setDetail(data)
                setDetailName(data.name)
                setDetailOauthJsonText(JSON.stringify(data.oauthJson ?? null, null, 2))
            } catch (e) {
                toast(e instanceof Error ? e.message : String(e))
            } finally {
                setDetailLoading(false)
            }
        })()
    }, [accountId, open])

    async function saveName() {
        if (!accountId) {
            return
        }
        setLoading(true)
        try {
            await updateAccountName(accountId, detailName)
            toast("账号已更新")
            await onChanged()
            onOpenChange(false)
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>账号详情</DialogTitle>
                    <DialogDescription>查看账号信息并修改名称。</DialogDescription>
                </DialogHeader>

                <FieldGroup className="gap-4">
                    <Field>
                        <FieldLabel htmlFor="account-name">账号名称</FieldLabel>
                        <Input
                            id="account-name"
                            value={detailName}
                            onChange={(e) => setDetailName(e.target.value)}
                            placeholder="账号名称"
                            disabled={detailLoading}
                        />
                        <FieldDescription>仅修改展示名称，不会影响 OAuth 信息。</FieldDescription>
                    </Field>
                    <Field>
                        <FieldLabel>类型</FieldLabel>
                        <div>
                            <Badge variant="outline">{detail?.authType ?? "-"}</Badge>
                        </div>
                    </Field>
                    <Field>
                        <FieldLabel>oauth_json</FieldLabel>
                        <div className="rounded-md border bg-secondary/10">
                            <pre
                                className="max-h-80 overflow-auto p-3 text-xs leading-relaxed whitespace-pre-wrap wrap-break-word font-mono">
                                {detailLoading ? "加载中…" : detailOauthJsonText}
                            </pre>
                        </div>
                    </Field>
                </FieldGroup>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
                        关闭
                    </Button>
                    <Button onClick={saveName} disabled={loading || detailLoading || !accountId}>
                        {loading ? "保存中…" : "保存修改"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

type AccountRemoveDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    item?: AccountListItem
    onConfirm: (id: string) => Promise<void> | void
    loading: boolean
}

function AccountRemoveDialog({ open, onOpenChange, item, onConfirm, loading }: AccountRemoveDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>确认删除</DialogTitle>
                    <DialogDescription>
                        该操作不可恢复。请再次确认要删除账号：{item?.name ?? "-"}
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
                        取消
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            if (item) {
                                void onConfirm(item.id)
                            }
                        }}
                        disabled={loading || !item}
                    >
                        {loading ? "删除中…" : "再次确认删除"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

type AccountTableProps = {
    loading: boolean
    items: AccountListItem[]
    onOpenDetail: (id: string) => void
    onRemove: (item: AccountListItem) => Promise<void> | void
}

function AccountTable({
                          loading,
                          items,
                          onOpenDetail,
                          onRemove,
                      }: AccountTableProps) {
    return (
        <div className="rounded-lg border">
            <Table>
                <TableHeader className="bg-secondary/45">
                    <TableRow>
                        <TableHead className="px-3">名称</TableHead>
                        <TableHead className="px-3">类型</TableHead>
                        <TableHead className="px-3">创建时间</TableHead>
                        <TableHead className="px-3">操作</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.length === 0 ? (
                        <TableRow>
                            <TableCell className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                                {loading ? "加载中…" : "暂无账号。可以点右上角“通过 OAuth 新增”。"}
                            </TableCell>
                        </TableRow>
                    ) : (
                        items.map((it) => {
                            return (
                                <TableRow key={it.id}>
                                    <TableCell className="px-3">
                                        <div className="font-medium text-foreground">{it.name}</div>
                                    </TableCell>
                                    <TableCell className="px-3">
                                        <Badge variant="outline">{it.authType}</Badge>
                                    </TableCell>
                                    <TableCell className="px-3 text-muted-foreground">
                                        {formatTime(it.createTime)}
                                    </TableCell>
                                    <TableCell className="px-3">
                                        <div className="flex flex-wrap gap-2">
                                            <Button size="sm" variant="outline" onClick={() => onOpenDetail(it.id)}>
                                                <Pencil className="h-4 w-4" aria-hidden="true"/>
                                                修改
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => onRemove(it)}
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true"/>
                                                删除
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    )
}

export function AccountPage() {
    const [loading, setLoading] = useState(false)
    const [items, setItems] = useState<AccountListItem[]>([])

    const [createDialogOpen, setCreateDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [editDialogAccountId, setEditDialogAccountId] = useState<string>()

    const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
    const [removeDialogItem, setRemoveDialogItem] = useState<AccountListItem>()
    const [removeLoading, setRemoveLoading] = useState(false)

    const total = items.length

    async function refresh() {
        setLoading(true)
        try {
            const data = await listAccounts()
            setItems(data)
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void refresh()
    }, [])

    function requestRemove(item: AccountListItem) {
        setRemoveDialogItem(item)
        setRemoveDialogOpen(true)
    }

    async function confirmRemove(id: string) {
        setRemoveLoading(true)
        try {
            await deleteAccount(id)
            toast("账号已删除")
            setRemoveDialogOpen(false)
            setRemoveDialogItem(undefined)
            await refresh()
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e))
        } finally {
            setRemoveLoading(false)
        }
    }

    function openCreateDialog() {
        setCreateDialogOpen(true)
    }

    function openDetailDialog(id: string) {
        setEditDialogAccountId(id)
        setEditDialogOpen(true)
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">账号</h1>
                        <Badge variant="secondary">Account</Badge>
                    </div>
                    <p className="mt-2 max-w-[72ch] text-sm text-muted-foreground">
                        管理 Codex OAuth 账号：列表、改名、删除；新增通过 OAuth 流程完成。
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={refresh} disabled={loading}>
                        <RefreshCcw className="h-4 w-4" aria-hidden="true"/>
                        刷新
                    </Button>
                    <Button onClick={openCreateDialog}>
                        <Key className="h-4 w-4" aria-hidden="true"/>
                        通过 OAuth 新增
                    </Button>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        账号列表
                    </CardTitle>
                    <CardDescription>共 {total} 条</CardDescription>
                </CardHeader>
                <CardContent>
                    <AccountTable
                        loading={loading}
                        items={items}
                        onOpenDetail={openDetailDialog}
                        onRemove={requestRemove}
                    />
                </CardContent>
            </Card>

            <AccountCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onChanged={refresh}/>

            <AccountEditDialog
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                accountId={editDialogAccountId}
                onChanged={refresh}
            />

            <AccountRemoveDialog
                open={removeDialogOpen}
                onOpenChange={(open) => {
                    setRemoveDialogOpen(open)
                    if (!open) {
                        setRemoveDialogItem(undefined)
                        setRemoveLoading(false)
                    }
                }}
                item={removeDialogItem}
                onConfirm={confirmRemove}
                loading={removeLoading}
            />
        </div>
    )
}
