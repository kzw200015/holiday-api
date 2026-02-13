export function formatDateForInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function addDays(dateText: string, days: number) {
  const parts = dateText.split("-")
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])

  const baseDate = new Date(year, month - 1, day)
  baseDate.setDate(baseDate.getDate() + days)
  return formatDateForInput(baseDate)
}
