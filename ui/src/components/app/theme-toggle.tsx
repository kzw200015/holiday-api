import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"

import { Switch } from "@/components/ui/switch"

/**
 * 亮/暗主题切换按钮。
 *
 * 约定：通过给 `document.documentElement`（html 标签）添加/移除 `dark` class 来驱动 Tailwind 的 darkMode。
 */
export function ThemeToggle() {
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
