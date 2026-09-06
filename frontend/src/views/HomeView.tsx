import { defineComponent } from "vue"
import { RouterLink, useRouter } from "vue-router"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getNavigationItems } from "@/layouts/navigation"

/* 首页展示业务入口，名称与侧边栏共同取自路由。 */
export default defineComponent({
  name: "HomeView",
  setup() {
    const items = getNavigationItems(useRouter()).filter((item) => item.name !== "home")

    return () => (
      <div class="page-content grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <RouterLink class="rounded-lg outline-offset-4" key={item.name} to={{ name: item.name }}>
            <Card class="hover:bg-accent/50 h-full transition-colors">
              <CardHeader>
                <item.icon class="text-muted-foreground mb-2 size-6" />
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent class="text-primary text-sm">进入{item.label} →</CardContent>
            </Card>
          </RouterLink>
        ))}
      </div>
    )
  },
})
