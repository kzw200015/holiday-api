import { defineComponent } from "vue"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/* 首页占位内容，用于验证布局的滚动与响应式表现 */
export default defineComponent({
  name: "HomeView",
  setup() {
    return () => (
      <div class="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>页面框架</CardTitle>
            <CardDescription>
              侧边栏可折叠为图标栏（快捷键 Cmd/Ctrl + B），折叠状态写入 cookie；视口小于 768
              像素时自动切换为抽屉。
            </CardDescription>
          </CardHeader>
          <CardContent class="text-muted-foreground text-sm">
            组件来自 shadcn-vue，源码位于 src/components/ui，可直接修改。
          </CardContent>
        </Card>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {["响应式栅格", "主题变量", "暗色模式"].map((title) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle class="text-sm">{title}</CardTitle>
                <CardDescription>占位内容</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    )
  },
})
