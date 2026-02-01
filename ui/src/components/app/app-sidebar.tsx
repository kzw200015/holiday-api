import { NavLink } from "react-router-dom"
import { CalendarDays, Gauge } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type NavItem = {
    to: string
    label: string
    Icon: typeof Gauge
    end?: boolean
}

const navItems: NavItem[] = [
    { to: "/", label: "概览", Icon: Gauge, end: true },
    { to: "/holiday", label: "节假日", Icon: CalendarDays },
]

function getNavItemClassName(isActive: boolean) {
    return cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        "hover:bg-secondary/55 hover:text-foreground",
        isActive
            ? "bg-secondary/70 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border)/0.65)]"
            : "text-muted-foreground",
    )
}

export function AppSidebar() {
    return (
        <div className="flex h-full flex-col">
            <ScrollArea className="flex-1 px-3 py-5">
                <nav className="space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) => getNavItemClassName(isActive)}
                        >
                            <item.Icon className="h-4 w-4 opacity-90" aria-hidden="true"/>
                            <span className="truncate">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="mt-6 rounded-xl border bg-card/40 p-4 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">快捷提示</div>
                    <div className="mt-2 leading-relaxed">
                        这里是一个可扩展的两栏骨架：路由负责内容切换，侧栏保持稳定。
                    </div>
                </div>
            </ScrollArea>
        </div>
    )
}
