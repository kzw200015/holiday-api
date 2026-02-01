import { useState } from "react"
import { Pencil, RefreshCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type AccountListItem, deleteAccount, refreshAccountToken } from "@/lib/api/account"

import { AccountEditDialog } from "./account-edit-dialog"
import { AccountRemoveDialog } from "./account-remove-dialog"
import { formatTime } from "./format-time"

type AccountTableProps = {
    loading: boolean
    items: AccountListItem[]
    onChanged: () => Promise<void> | void
}

export function AccountTable({ loading, items, onChanged }: AccountTableProps) {
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [editDialogAccountId, setEditDialogAccountId] = useState<string>()

    const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
    const [removeDialogItem, setRemoveDialogItem] = useState<AccountListItem>()
    const [removeLoading, setRemoveLoading] = useState(false)

    const [refreshTokenLoadingId, setRefreshTokenLoadingId] = useState<string>()

    const actionBusy = loading || removeLoading || refreshTokenLoadingId != null

    function openDetailDialog(id: string) {
        setEditDialogAccountId(id)
        setEditDialogOpen(true)
    }

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
            await onChanged()
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e))
        } finally {
            setRemoveLoading(false)
        }
    }

    async function requestRefreshToken(item: AccountListItem) {
        setRefreshTokenLoadingId(item.id)
        try {
            await refreshAccountToken(item.id)
            toast("token 已刷新")
            await onChanged()
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e))
        } finally {
            setRefreshTokenLoadingId(undefined)
        }
    }

    return (
        <>
            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
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
                                const refreshTokenLoading = refreshTokenLoadingId === it.id
                                return (
                                    <TableRow key={it.id}>
                                        <TableCell className="px-3">
                                            <div className="font-medium text-foreground">{it.name}</div>
                                        </TableCell>
                                        <TableCell className="px-3">
                                            <Badge variant="outline">{it.authType}</Badge>
                                        </TableCell>
                                        <TableCell
                                            className="px-3 text-muted-foreground">{formatTime(it.createTime)}</TableCell>
                                        <TableCell className="px-3">
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => openDetailDialog(it.id)}
                                                    disabled={actionBusy}
                                                >
                                                    <Pencil aria-hidden="true"/>
                                                    修改
                                                </Button>

                                                {it.authType === "oauth" ? (
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => requestRefreshToken(it)}
                                                        disabled={actionBusy}
                                                    >
                                                        <RefreshCcw aria-hidden="true"/>
                                                        {refreshTokenLoading ? "刷新中…" : "刷新 token"}
                                                    </Button>
                                                ) : null}

                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => requestRemove(it)}
                                                    disabled={actionBusy}
                                                >
                                                    <Trash2 aria-hidden="true"/>
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

            <AccountEditDialog
                open={editDialogOpen}
                onOpenChange={(open) => {
                    setEditDialogOpen(open)
                    if (!open) {
                        setEditDialogAccountId(undefined)
                    }
                }}
                accountId={editDialogAccountId}
                onChanged={onChanged}
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
        </>
    )
}
