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
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { completeCodexOAuth, getCodexAuthorizeUrl } from "@/lib/api/account"

import { formatTime } from "./format-time"

type AccountCreateDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    onChanged: () => Promise<void> | void
}

export function AccountCreateDialog({ open, onOpenChange, onChanged }: AccountCreateDialogProps) {
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
