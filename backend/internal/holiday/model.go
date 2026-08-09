package holiday

// DateLayout 是本模块统一使用的日期格式。
const DateLayout = "2006-01-02"

// DaySnapshot 是远程节假日 JSON 中的单日数据，同时用作 holiday_days 表的行结构。
type DaySnapshot struct {
	Name     string `db:"name"        json:"name"`
	Date     string `db:"date"        json:"date"`
	IsOffDay bool   `db:"is_off_day"  json:"isOffDay"`
}

// QueryResult 是节假日查询接口返回的数据。
// Name 为空表示该日期在节假日表中无记录（普通工作日或普通周末）。
type QueryResult struct {
	Date     string `json:"date"`
	IsOffDay bool   `json:"isOffDay"`
	Name     string `json:"name"`
}
