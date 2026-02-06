package holiday

const (
	// DateLayout 是接口约定的日期格式。
	DateLayout = "2006-01-02"
	// baseURL 是节假日数据来源地址。
	baseURL = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master"
)

// Day 是单日节假日信息。
type Day struct {
	Name     string `json:"name"`
	Date     string `json:"date"`
	IsOffDay bool   `json:"isOffDay"`
}

type holidayJSON struct {
	Days []Day `json:"days"`
}
