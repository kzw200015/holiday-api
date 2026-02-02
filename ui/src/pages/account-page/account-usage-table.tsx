import { useEffect, useState } from "react"
import { RefreshCcw } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type AccountUsageItem, listAccountUsage } from "@/lib/api/account"

import { formatTime } from "./format-time"

function formatTokenCount(value: number | null) {
    if (value == null) {
        return "-"
    }
    return String(value)
}

const streamLabelMap = {
    stream: "流式",
    non_stream: "非流式",
} as const

const pageSize = 10

function resolvePageItems(current: number, totalPages: number) {
    if (totalPages <= 5) {
        return Array.from({ length: totalPages }, (_, index) => index + 1)
    }

    const pageSet = new Set([1, totalPages, current - 1, current, current + 1])
    const pages = Array.from(pageSet)
        .filter((page) => page >= 1 && page <= totalPages)
        .sort((a, b) => a - b)

    const items: Array<number | "ellipsis"> = []
    let lastPage = 0
    for (const page of pages) {
        if (lastPage > 0 && page - lastPage > 1) {
            items.push("ellipsis")
        }
        items.push(page)
        lastPage = page
    }
    return items
}

export function AccountUsageTable() {
    const [loading, setLoading] = useState(false)
    const [records, setRecords] = useState<AccountUsageItem[]>([])
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)

    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const pageItems = resolvePageItems(page, totalPages)

    async function refresh(targetPage = page) {
        setLoading(true)
        try {
            const data = await listAccountUsage(targetPage, pageSize)
            const nextTotalPages = Math.max(1, Math.ceil(data.total / pageSize))
            if (data.current > nextTotalPages) {
                setRecords([])
                setTotal(data.total)
                setPage(nextTotalPages)
                return
            }
            setRecords(data.records)
            setPage(data.current)
            setTotal(data.total)
        } catch (e) {
            toast(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void refresh(page)
    }, [page])

    function changePage(nextPage: number) {
        if (nextPage < 1 || nextPage > totalPages || nextPage === page || loading) {
            return
        }
        setPage(nextPage)
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="flex items-center gap-2">账号用量</CardTitle>
                        <CardDescription>共 {total} 条，第 {page} / {totalPages} 页</CardDescription>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => refresh(page)} disabled={loading}>
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
                            {records.length === 0 ? (
                                <TableRow>
                                    <TableCell className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                                        {loading ? "加载中…" : "暂无用量记录。先调用一次 /api/responses。"}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                records.map((it) => (
                                    <TableRow key={it.id}>
                                        <TableCell className="px-3 text-muted-foreground">{formatTime(it.createTime)}</TableCell>
                                        <TableCell className="px-3">
                                            <div className="font-medium text-foreground">{it.accountName ?? it.accountId}</div>
                                        </TableCell>
                                        <TableCell className="px-3">
                                            <Badge variant="outline">{streamLabelMap[it.stream]}</Badge>
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
                <Pagination className="mt-4">
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                href="#"
                                text="上一页"
                                className={page === 1 ? "pointer-events-none opacity-50" : ""}
                                onClick={(event) => {
                                    event.preventDefault()
                                    changePage(page - 1)
                                }}
                                aria-disabled={page === 1}
                                tabIndex={page === 1 ? -1 : 0}
                            />
                        </PaginationItem>
                        {pageItems.map((item, index) => {
                            if (item === "ellipsis") {
                                return (
                                    <PaginationItem key={`ellipsis-${index}`}>
                                        <PaginationEllipsis/>
                                    </PaginationItem>
                                )
                            }
                            return (
                                <PaginationItem key={item}>
                                    <PaginationLink
                                        href="#"
                                        isActive={item === page}
                                        onClick={(event) => {
                                            event.preventDefault()
                                            changePage(item)
                                        }}
                                    >
                                        {item}
                                    </PaginationLink>
                                </PaginationItem>
                            )
                        })}
                        <PaginationItem>
                            <PaginationNext
                                href="#"
                                text="下一页"
                                className={page === totalPages ? "pointer-events-none opacity-50" : ""}
                                onClick={(event) => {
                                    event.preventDefault()
                                    changePage(page + 1)
                                }}
                                aria-disabled={page === totalPages}
                                tabIndex={page === totalPages ? -1 : 0}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            </CardContent>
        </Card>
    )
}
