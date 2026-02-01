import { Pencil, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type AccountListItem } from "@/lib/api/account"

import { formatTime } from "./format-time"

type AccountTableProps = {
    loading: boolean
    items: AccountListItem[]
    onOpenDetail: (id: string) => void
    onRemove: (item: AccountListItem) => Promise<void> | void
}

export function AccountTable({ loading, items, onOpenDetail, onRemove }: AccountTableProps) {
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
                                    <TableCell className="px-3 text-muted-foreground">{formatTime(it.createTime)}</TableCell>
                                    <TableCell className="px-3">
                                        <div className="flex flex-wrap gap-2">
                                            <Button size="sm" variant="secondary" onClick={() => onOpenDetail(it.id)}>
                                                <Pencil className="h-4 w-4" aria-hidden="true"/>
                                                修改
                                            </Button>

                                            <Button size="sm" variant="destructive" onClick={() => onRemove(it)}>
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
