import { Badge } from "@/components/ui/badge"

import { AccountTable } from "./account-table"
import { AccountUsageTable } from "./account-usage-table"

export function AccountPage() {
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
            </div>

            <AccountTable/>

            <AccountUsageTable/>
        </div>
    )
}
