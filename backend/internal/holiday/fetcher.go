package holiday

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// fetchYearDays 从上游拉取指定年份的节假日数据。
func fetchYearDays(year int) ([]Day, error) {
	requestURL := fmt.Sprintf("%s/%d.json", baseURL, year)
	response, err := http.Get(requestURL)
	if err != nil {
		return nil, fmt.Errorf("请求假期数据失败: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("请求假期数据失败: status=%d", response.StatusCode)
	}

	var payload holidayJSON
	if err = json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("解析假期数据失败: %w", err)
	}
	return payload.Days, nil
}
