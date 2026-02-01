import dayjs from "dayjs"

export function formatTime(timeText: string) {
    const d = dayjs(timeText)
    if (!d.isValid()) {
        return timeText
    }
    return d.format("YYYY-MM-DD HH:mm:ss")
}
