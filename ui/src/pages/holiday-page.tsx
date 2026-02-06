import { useCallback, useEffect, useState } from "react"
import { CalendarDays, CircleCheck, CircleX, Hourglass } from "lucide-react"
import { toast } from "sonner"

import { AppDatePicker, formatDateForInput } from "@/components/app/date-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { queryIsHoliday } from "@/lib/api/holiday"

const NEXT_OFF_DAY_SEARCH_RANGE = 60

function addDays(dateText: string, days: number) {
    const parts = dateText.split("-")
    const year = Number(parts[0])
    const month = Number(parts[1])
    const day = Number(parts[2])
    const baseDate = new Date(year, month - 1, day)
    baseDate.setDate(baseDate.getDate() + days)
    return formatDateForInput(baseDate)
}

type HolidayQueryResult = {
    isHoliday?: boolean
    nextOffDayDate?: string
    daysToNextOffDay?: number
}

async function queryNextOffDay(baseDateText: string): Promise<Pick<HolidayQueryResult, "nextOffDayDate" | "daysToNextOffDay">> {
    for (let i = 1; i <= NEXT_OFF_DAY_SEARCH_RANGE; i += 1) {
        const candidateDate = addDays(baseDateText, i)
        const candidateResult = await queryIsHoliday(candidateDate)
        if (candidateResult) {
            return {
                nextOffDayDate: candidateDate,
                daysToNextOffDay: i,
            }
        }
    }

    throw new Error(`未找到下一个休息日（查询范围：${NEXT_OFF_DAY_SEARCH_RANGE}天）`)
}

export function HolidayPage() {
    const [date, setDate] = useState(() => formatDateForInput(new Date()))
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<HolidayQueryResult>({})

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const baseDateText = date || formatDateForInput(new Date())
            const currentIsHoliday = await queryIsHoliday(date || undefined)

            if (currentIsHoliday) {
                setResult({
                    isHoliday: true,
                    nextOffDayDate: baseDateText,
                    daysToNextOffDay: 0,
                })
                return
            }

            const nextOffDay = await queryNextOffDay(baseDateText)
            setResult({
                isHoliday: false,
                ...nextOffDay,
            })
        } catch (e) {
            setResult({})
            toast(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }, [date])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const title = result.isHoliday === undefined ? "未查询" : result.isHoliday ? "休息日" : "工作日"
    const currentDateText = date ? `日期：${date}` : "日期：今天"
    const nextOffDayText = loading ? "计算中…" : result.daysToNextOffDay === undefined ? "-" : `${result.daysToNextOffDay} 天`
    const nextOffDayDateText = loading ? "日期：计算中…" : result.nextOffDayDate ? `日期：${result.nextOffDayDate}` : "日期：-"
    const ResultIcon = result.isHoliday === undefined ? CircleX : CircleCheck

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
                            <CalendarDays className="h-4 w-4" aria-hidden="true"/>
                            查询
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="text-sm text-muted-foreground" htmlFor="holiday-date">
                                日期
                            </label>
                            <AppDatePicker id="holiday-date" value={date} onValueChange={setDate} disabled={loading}/>
                            <Button onClick={refresh} disabled={loading}>
                                {loading ? "查询中…" : "查询"}
                            </Button>
                        </div>

                        <div className="text-sm text-muted-foreground">
                            支持留空（后端默认使用当天日期）。
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ResultIcon className="h-4 w-4" aria-hidden="true"/>
                            当天结果
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-3xl font-semibold tracking-tight">{title}</div>
                        <div className="text-sm text-muted-foreground">{currentDateText}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Hourglass className="h-4 w-4" aria-hidden="true"/>
                            下一个休息日
                        </CardTitle>
                        <CardDescription>按所选日期向后推算</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="text-3xl font-semibold tracking-tight">{nextOffDayText}</div>
                        <div className="text-sm text-muted-foreground">{nextOffDayDateText}</div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
