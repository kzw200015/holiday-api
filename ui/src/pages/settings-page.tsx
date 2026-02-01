import { Bell, Palette } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
            <Badge variant="outline">占位</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            这里可以放置主题、账号、通知、环境变量等配置入口。
          </p>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
              主题与视觉
            </CardTitle>
            <CardDescription>使用 CSS 变量作为单一真相</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            当前配色在 `src/index.css` 中统一定义，后续切换主题只需要切换 root 的变量集合即可。
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-accent" aria-hidden="true" />
              通知与提醒
            </CardTitle>
            <CardDescription>示例内容</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            后续可接入 toast / dialog / form 等 shadcn 组件来完善交互。
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
