import { useEffect, useMemo, useState } from "react"
import { CalendarDays, CircleCheck, CircleX, Hourglass } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { queryIsHoliday } from "@/lib/api/holiday"

function formatDateForInput(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function addDays(dateText: string, days: number) {
    const parts = dateText.split("-")
    const year = Number(parts[0])
    const month = Number(parts[1])
    const day = Number(parts[2])
    const baseDate = new Date(year, month - 1, day)
    baseDate.setDate(baseDate.getDate() + days)
    return formatDateForInput(baseDate)
}

export function HolidayPage() {
    const [date, setDate] = useState(() => formatDateForInput(new Date()))
    const [loading, setLoading] = useState(false)
    const [isHoliday, setIsHoliday] = useState<boolean>()
    const [nextOffDayDate, setNextOffDayDate] = useState<string>()
    const [daysToNextOffDay, setDaysToNextOffDay] = useState<number>()
    const [error, setError] = useState<string>()

    const title = useMemo(() => {
        if (isHoliday === undefined) {
            return "未查询"
        }
        return isHoliday ? "休息日" : "工作日"
    }, [isHoliday])

    async function refresh() {
        setLoading(true)
        setError(undefined)
        setNextOffDayDate(undefined)
        setDaysToNextOffDay(undefined)
        try {
            const baseDateText = date && date.trim().length > 0 ? date : formatDateForInput(new Date())
            const result = await queryIsHoliday(date)
            setIsHoliday(result)

            if (result) {
                setNextOffDayDate(baseDateText)
                setDaysToNextOffDay(0)
                return
            }

            for (let i = 1; i <= 60; i += 1) {
                const candidateDate = addDays(baseDateText, i)
                const candidateResult = await queryIsHoliday(candidateDate)
                if (candidateResult) {
                    setNextOffDayDate(candidateDate)
                    setDaysToNextOffDay(i)
                    return
                }
            }

            throw new Error("未找到下一个休息日（查询范围：60天）")
        } catch (e) {
            setIsHoliday(undefined)
            setNextOffDayDate(undefined)
            setDaysToNextOffDay(undefined)
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void refresh()
    }, [])

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight">节假日</h1>
                        <Badge variant="secondary">后端接口</Badge>
                    </div>
                    <p className="mt-2 max-w-[72ch] text-sm text-muted-foreground">
                        通过后端接口判断某一天是否为休息日（包含法定节假日与调休）。
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true"/>
                            查询
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="text-sm text-muted-foreground" htmlFor="holiday-date">
                                日期
                            </label>
                            <input
                                id="holiday-date"
                                className="h-9 w-50 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                            <Button onClick={refresh} disabled={loading}>
                                {loading ? "查询中…" : "查询"}
                            </Button>
                        </div>

                        {error ? (
                            <div className="text-sm text-destructive">{error}</div>
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                支持留空（后端默认使用当天日期）。
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {isHoliday === undefined ? (
                                <CircleX className="h-4 w-4 text-muted-foreground" aria-hidden="true"/>
                            ) : (
                                <CircleCheck className="h-4 w-4 text-accent" aria-hidden="true"/>
                            )}
                            当天结果
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-3xl font-semibold tracking-tight">{title}</div>
                        <div className="text-sm text-muted-foreground">
                            {date && date.trim().length > 0 ? `日期：${date}` : "日期：今天"}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Hourglass className="h-4 w-4 text-accent" aria-hidden="true"/>
                            下一个休息日
                        </CardTitle>
                        <CardDescription>按所选日期向后推算</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-3xl font-semibold tracking-tight">
                            {loading
                                ? "计算中…"
                                : daysToNextOffDay === undefined
                                    ? "-"
                                    : `${daysToNextOffDay} 天`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            {loading ? "日期：计算中…" : nextOffDayDate ? `日期：${nextOffDayDate}` : "日期：-"}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
