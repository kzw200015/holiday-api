package holiday

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// 数据源的基础地址。
const remoteBaseURL = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master"

// RemoteClient 从 holiday-cn 仓库拉取节假日数据。
// 数据源把 .json 文件按 text/plain 返回，这里不看 Content-Type，直接按 JSON 解。
type RemoteClient struct {
	client *http.Client
}

func NewRemoteClient() *RemoteClient {
	// 单次拉取的总超时
	return &RemoteClient{client: &http.Client{Timeout: 60 * time.Second}}
}

// FetchYear 拉取指定年份的数据，顺带校验每条记录的日期格式，避免脏数据入库。
func (c *RemoteClient) FetchYear(ctx context.Context, year int) ([]Day, error) {
	url := fmt.Sprintf("%s/%d.json", remoteBaseURL, year)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	response, err := c.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("拉取 %d 年节假日数据失败: %w", year, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("拉取 %d 年节假日数据失败: HTTP %d", year, response.StatusCode)
	}

	var payload struct {
		Days []Day `json:"days"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("拉取 %d 年节假日数据失败: %w", year, err)
	}

	for _, day := range payload.Days {
		if _, err := time.Parse(dateLayout, day.Date); err != nil {
			return nil, fmt.Errorf("%d 年节假日数据里有不合法的日期 %q", year, day.Date)
		}
	}
	return payload.Days, nil
}
