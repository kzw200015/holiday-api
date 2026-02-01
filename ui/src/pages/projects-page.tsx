import { FolderKanban, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">项目</h1>
            <Badge variant="secondary">示例页</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            这里预留给“项目列表 / 项目详情 / 接口分组”等实际业务模块。
          </p>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-primary" aria-hidden="true" />
              列表区域
            </CardTitle>
            <CardDescription>你可以在这里渲染表格或卡片列表</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            建议按模块拆分：筛选栏、列表区、分页区分别独立组件，减少无意义的重渲染。
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
              右侧内容区
            </CardTitle>
            <CardDescription>路由切换仅影响 Outlet 区域</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            侧栏保持稳定，这也是控制台类产品最常用的结构之一。
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
