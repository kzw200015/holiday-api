import { matchPath, NavLink, useLocation } from "react-router-dom"
import { CalendarDays, Gauge, Key } from "lucide-react"
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar"

type NavItem = {
    to: string
    label: string
    Icon: typeof Gauge
    end?: boolean
}

const navItems: NavItem[] = [
    { to: "/account", label: "账号", Icon: Key },
    { to: "/holiday", label: "节假日", Icon: CalendarDays },
]

export function AppSidebar() {
    const location = useLocation()

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild size="lg" tooltip="控制台">
                            <NavLink to="/account" end>
                                <div
                                    className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-xs font-semibold"
                                    aria-hidden="true"
                                >
                                    API
                                </div>
                                <div
                                    className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                                    <span className="truncate font-medium">控制台</span>
                                    <span className="truncate text-xs text-sidebar-foreground/70">Java API</span>
                                </div>
                            </NavLink>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {navItems.map((item) => {
                                const isActive = !!matchPath(
                                    { path: item.to, end: item.end ?? false },
                                    location.pathname,
                                )

                                return (
                                    <SidebarMenuItem key={item.to}>
                                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                                            <NavLink to={item.to} end={item.end}>
                                                <item.Icon aria-hidden="true"/>
                                                <span>{item.label}</span>
                                            </NavLink>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    )
}
