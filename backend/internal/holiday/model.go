package holiday

// DateLayout 是本模块统一使用的日期格式。
const DateLayout = "2006-01-02"

// DaySnapshot 是远程节假日 JSON 中的单日数据。
type DaySnapshot struct {
	Name     string `json:"name"`
	Date     string `json:"date"`
	IsOffDay bool   `json:"isOffDay"`
}
