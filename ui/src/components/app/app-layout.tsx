import { Outlet } from "react-router-dom"

import { AppSidebar } from "@/components/app/app-sidebar.tsx"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar.tsx"
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch.tsx";

export function AppLayout() {
    return (
        <SidebarProvider className="relative min-h-screen bg-background">
            <AppSidebar/>

            <SidebarInset className="relative bg-transparent">
                <div className="relative grid min-h-svh w-full grid-rows-[auto_1fr]">
                    <header
                        className="sticky top-0 z-10 border-b border-border/70 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/80">
                        <div className="flex items-center justify-between gap-3 px-6 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <SidebarTrigger className="-ml-1"/>
                                <div className="text-sm text-muted-foreground">控制台
                                </div>
                            </div>
                            <ThemeToggle/>
                        </div>
                    </header>

                    <main className="min-w-0 px-6 py-6">
                        <Outlet/>
                    </main>
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}

function ThemeToggle() {
    const [isDark, setIsDark] = useState(false)

    useEffect(() => {
        setIsDark(document.documentElement.classList.contains("dark"))
    }, [])

    function handleCheckedChange(checked: boolean) {
        document.documentElement.classList.toggle("dark", checked)
        setIsDark(checked)
    }

    return (
        <div className="flex items-center gap-2">
            <Sun
                aria-hidden="true"
                className={isDark ? "text-muted-foreground/60" : "text-foreground"}
            />
            <Switch
                aria-label="亮暗主题切换"
                checked={isDark}
                onCheckedChange={handleCheckedChange}
            />
            <Moon
                aria-hidden="true"
                className={isDark ? "text-foreground" : "text-muted-foreground/60"}
            />
        </div>
    )
}
