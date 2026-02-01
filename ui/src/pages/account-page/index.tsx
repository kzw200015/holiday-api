import { useEffect, useState } from "react"
import { Key, RefreshCcw } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type AccountListItem, deleteAccount, listAccounts } from "@/lib/api/account"

import { AccountCreateDialog } from "./account-create-dialog"
import { AccountEditDialog } from "./account-edit-dialog"
import { AccountRemoveDialog } from "./account-remove-dialog"
import { AccountTable } from "./account-table"

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
                    <Button variant="outline" onClick={refresh} disabled={loading}>
                        <RefreshCcw aria-hidden="true"/>
                        刷新
                    </Button>
                    <Button onClick={openCreateDialog}>
                        <Key aria-hidden="true"/>
                        通过 OAuth 新增
                    </Button>
                </div>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">账号列表</CardTitle>
                    <CardDescription>共 {total} 条</CardDescription>
                </CardHeader>
                <CardContent>
                    <AccountTable loading={loading} items={items} onOpenDetail={openDetailDialog} onRemove={requestRemove}/>
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
