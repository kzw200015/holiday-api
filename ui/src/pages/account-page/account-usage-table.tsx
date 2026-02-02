import { useEffect, useState } from "react"
import { RefreshCcw } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type AccountUsageItem, listAccountUsage } from "@/lib/api/account"

import { formatTime } from "./format-time"

function formatTokenCount(value: number | null) {
    if (value == null) {
        return "-"
    }
    return String(value)
}

export function AccountUsageTable() {
    const [loading, setLoading] = useState(false)
    const [items, setItems] = useState<AccountUsageItem[]>([])

    const total = items.length
    const limit = 200

    async function refresh() {
        setLoading(true)
        try {
            const data = await listAccountUsage(limit)
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

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="flex items-center gap-2">账号用量</CardTitle>
                        <CardDescription>最近 {total} 条（上限 {limit}）</CardDescription>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={refresh} disabled={loading}>
                            <RefreshCcw aria-hidden="true"/>
                            刷新
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="px-3">时间</TableHead>
                                <TableHead className="px-3">账号</TableHead>
                                <TableHead className="px-3">类型</TableHead>
                                <TableHead className="px-3">输入 token</TableHead>
                                <TableHead className="px-3">缓存 token</TableHead>
                                <TableHead className="px-3">输出 token</TableHead>
                                <TableHead className="px-3">耗时</TableHead>
                                <TableHead className="px-3">状态</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.length === 0 ? (
                                <TableRow>
                                    <TableCell className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                                        {loading ? "加载中…" : "暂无用量记录。先调用一次 /api/responses。"}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                items.map((it) => (
                                    <TableRow key={it.id}>
                                        <TableCell className="px-3 text-muted-foreground">{formatTime(it.createTime)}</TableCell>
                                        <TableCell className="px-3">
                                            <div className="font-medium text-foreground">{it.accountName ?? it.accountId}</div>
                                        </TableCell>
                                        <TableCell className="px-3">
                                            <Badge variant="outline">{it.stream ? "sse" : "json"}</Badge>
                                        </TableCell>
                                        <TableCell className="px-3 tabular-nums">{formatTokenCount(it.inputTokens)}</TableCell>
                                        <TableCell className="px-3 tabular-nums">{formatTokenCount(it.cachedInputTokens)}</TableCell>
                                        <TableCell className="px-3 tabular-nums">{formatTokenCount(it.outputTokens)}</TableCell>
                                        <TableCell className="px-3 tabular-nums">{it.costMs} ms</TableCell>
                                        <TableCell className="px-3">
                                            <Badge
                                                variant={it.upstreamStatus != null && it.upstreamStatus >= 400 ? "destructive" : "secondary"}
                                            >
                                                {it.upstreamStatus ?? "-"}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
