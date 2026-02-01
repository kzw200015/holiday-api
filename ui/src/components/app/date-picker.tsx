import { useState } from "react"
import { zhCN } from "date-fns/locale"
import { CalendarDays } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function formatDateForInput(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function parseDateFromInput(dateText: string) {
    const normalized = dateText.trim()
    if (!normalized) {
        return undefined
    }
    const parts = normalized.split("-")
    const year = Number(parts[0])
    const month = Number(parts[1])
    const day = Number(parts[2])
    return new Date(year, month - 1, day)
}

type AppDatePickerProps = {
    id?: string
    value: string
    onValueChange: (value: string) => void
    disabled?: boolean
    placeholder?: string
    className?: string
}

export function AppDatePicker({
                                  id,
                                  value,
                                  onValueChange,
                                  disabled,
                                  placeholder = "选择日期",
                                  className,
                              }: AppDatePickerProps) {
    const [open, setOpen] = useState(false)
    const selectedDate = parseDateFromInput(value)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    className={cn("w-50 justify-start", className)}
                    disabled={disabled}
                >
                    <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true"/>
                    {value && value.trim().length > 0 ? value : placeholder}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0 gap-0">
                <div className="flex items-center justify-between gap-2 px-3 pt-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            onValueChange("")
                            setOpen(false)
                        }}
                        disabled={disabled || !value || value.trim().length === 0}
                    >
                        清除
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            onValueChange(formatDateForInput(new Date()))
                            setOpen(false)
                        }}
                        disabled={disabled}
                    >
                        今天
                    </Button>
                </div>
                <Calendar
                    mode="single"
                    locale={zhCN}
                    selected={selectedDate}
                    onSelect={(next) => {
                        if (next) {
                            onValueChange(formatDateForInput(next))
                        } else {
                            onValueChange("")
                        }
                        setOpen(false)
                    }}
                    autoFocus
                />
            </PopoverContent>
        </Popover>
    )
}
