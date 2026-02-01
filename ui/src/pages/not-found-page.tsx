import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"

export function NotFoundPage() {
    return (
        <div className="mx-auto max-w-140 space-y-3 py-10">
            <div className="text-sm text-muted-foreground">404</div>
            <h1 className="text-2xl font-semibold tracking-tight">页面不存在</h1>
            <p className="text-sm text-muted-foreground">
                你访问的路由没有匹配到页面。可以从侧栏返回，或直接回到概览页。
            </p>
            <div className="pt-2">
                <Button asChild variant="secondary">
                    <Link to="/">回到概览</Link>
                </Button>
            </div>
        </div>
    )
}
