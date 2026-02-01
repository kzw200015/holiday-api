import { useEffect, useState } from "react"
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { type AccountDetail, getAccountDetail, updateAccountName } from "@/lib/api/account"

type AccountEditDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    accountId?: string
    onChanged: () => Promise<void> | void
}

export function AccountEditDialog({ open, onOpenChange, accountId, onChanged }: AccountEditDialogProps) {
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
                        <Textarea
                            value={detailLoading ? "加载中…" : detailOauthJsonText}
                            disabled
                            spellCheck={false}
                            className="h-80 font-mono"
                        />
                    </Field>
                </FieldGroup>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
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
