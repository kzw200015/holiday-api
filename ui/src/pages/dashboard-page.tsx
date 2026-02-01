import { ArrowUpRight, Cable, ShieldCheck } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function DashboardPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">概览</h1>
                        <Badge variant="secondary">UI 框架</Badge>
                    </div>
                    <p className="mt-2 max-w-[72ch] text-sm text-muted-foreground">
                        一个偏“工具台/控制台”气质的两栏布局：左边导航稳定、右侧内容可路由切换，支持扩展为更多页面与模块。
                    </p>
                </div>

                <Button asChild>
                    <Link to="/holiday">
                        查看节假日
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true"/>
                    </Link>
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true"/>
                            组件体系
                        </CardTitle>
                        <CardDescription>shadcn/ui + Radix 的基础组件</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Button / Card / ScrollArea 等组件已接入，可按页面逐步扩展。
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Cable className="h-4 w-4 text-accent" aria-hidden="true"/>
                            路由结构
                        </CardTitle>
                        <CardDescription>React Router 负责页面切换</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        侧栏使用 NavLink 高亮当前路由，内容区由 Outlet 渲染。
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <span
                                className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.18)]"/>
                            视觉方向
                        </CardTitle>
                        <CardDescription>深色墨面 + 细网格 + 霓虹点光</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        通过 CSS 变量统一调色，布局层级使用半透明与轻微 blur，强调“深色工具台”的质感。
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
