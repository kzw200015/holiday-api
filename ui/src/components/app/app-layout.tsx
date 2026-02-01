import { Outlet } from "react-router-dom"

import { AppSidebar } from "@/components/app/app-sidebar.tsx"
import { ThemeToggle } from "@/components/app/theme-toggle.tsx"
import { Separator } from "@/components/ui/separator.tsx"

export function AppLayout() {
    return (
        <div className="relative min-h-screen app-surface">
            <div className="pointer-events-none absolute inset-0 app-grid opacity-60"/>

            <div className="relative grid min-h-screen w-full grid-rows-[auto_1fr]">
                <header
                    className="sticky top-0 z-10 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                    <div className="flex items-center justify-between gap-3 px-6 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="text-sm text-muted-foreground">
                                Java API · 控制台
                            </div>
                            <Separator className="mx-1 hidden h-4 w-px sm:block" orientation="vertical"/>
                            <div className="truncate text-sm text-muted-foreground">
                                React Router · shadcn/ui · Tailwind
                            </div>
                        </div>
                        <ThemeToggle/>
                    </div>
                </header>

                <div className="grid min-h-0 grid-cols-[280px_1fr]">
                    <aside className="min-h-0">
                        <AppSidebar/>
                    </aside>

                    <main className="min-w-0 px-6 py-6">
                        <Outlet/>
                    </main>
                </div>
            </div>
        </div>
    )
}
