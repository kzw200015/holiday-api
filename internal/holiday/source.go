package holiday

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/kzw200015/myapi/internal/config"
)

// Source 是节假日安排的数据源：GitHub 上的 holiday-cn 仓库，一年一个 JSON 文件。
type Source struct {
	client *http.Client
	// baseURL 是放各年文件的地址，`{year}.json` 拼在后面
	baseURL string
}

func NewSource(client *http.Client, cfg config.Config) *Source {
	return &Source{client: client, baseURL: cfg.HolidaySourceURL}
}

// payload 是 holiday-cn 一年的文件：`{"days": [...]}`，其余字段用不上。
//
// 按数据源的格式单独定义，不直接解成 [Day]：数据源的格式变了只改这里，接口的响应体不跟着变。
type payload struct {
	Days []struct {
		Name     string `json:"name"`
		Date     string `json:"date"`
		IsOffDay bool   `json:"isOffDay"`
	} `json:"days"`
}

// FetchYear 拉取一整年并校验格式，免得脏数据入库。还没发布时是空的。
func (s *Source) FetchYear(ctx context.Context, year int) ([]Day, error) {
	body, err := s.download(ctx, year)
	if err != nil {
		return nil, fmt.Errorf("拉取 %d 年节假日数据失败: %w", year, err)
	}
	if body == nil {
		return nil, nil
	}
	days, err := parse(body)
	if err != nil {
		return nil, fmt.Errorf("%d 年节假日数据格式不对: %w", year, err)
	}
	return days, nil
}

// download 是这一年的文件内容；文件还没建出来时是 nil。
func (s *Source) download(ctx context.Context, year int) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/%d.json", s.baseURL, year), nil)
	if err != nil {
		return nil, err
	}
	response, err := s.client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	switch {
	// 次年的文件要到某个时候才建出来，之前是 404：和「文件有了、安排还没公布」一样，都是还没发布
	case response.StatusCode == http.StatusNotFound:
		return nil, nil
	case response.StatusCode < 200 || response.StatusCode > 299:
		return nil, fmt.Errorf("HTTP %d", response.StatusCode)
	}
	// 数据源把 .json 文件按 text/plain 返回，不看 Content-Type，直接按 JSON 解
	return io.ReadAll(response.Body)
}

// parse 把一年的文件解成 [Day]。
func parse(body []byte) ([]Day, error) {
	var p payload
	if err := json.Unmarshal(body, &p); err != nil {
		return nil, err
	}
	days := make([]Day, len(p.Days))
	for i, d := range p.Days {
		date, err := time.Parse(time.DateOnly, d.Date)
		if err != nil {
			return nil, err
		}
		days[i] = Day{Date: date, IsOffDay: d.IsOffDay, Name: d.Name}
	}
	return days, nil
}
