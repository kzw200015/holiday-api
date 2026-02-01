import { Outlet } from 'react-router-dom'

import { AppSidebar } from '@/components/app/app-sidebar'
import { Separator } from '@/components/ui/separator'

export function AppLayout() {
    return (
        <div className="relative min-h-screen app-surface">
            <div className="pointer-events-none absolute inset-0 app-grid opacity-60"/>

            <div className="relative mx-auto grid min-h-screen max-w-[1200px] grid-rows-[auto_1fr]">
                <header
                    className="sticky top-0 z-10 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                    <div className="flex items-center gap-3 px-6 py-4">
                        <div className="text-sm text-muted-foreground">
                            Java API · 控制台
                        </div>
                        <Separator className="mx-1 hidden h-4 w-px sm:block" orientation="vertical"/>
                        <div className="text-sm text-muted-foreground">
                            React Router · shadcn/ui · Tailwind
                        </div>
                    </div>
                </header>

                <div className="grid min-h-0 grid-cols-[280px_1fr]">
                    <aside className="min-h-0 border-r border-border/70">
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
