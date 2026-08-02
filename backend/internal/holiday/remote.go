package holiday

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// remoteBaseURL 是节假日数据源（holiday-cn 仓库）的基础地址。
const remoteBaseURL = "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master"

// RemoteClient 负责从远程数据源拉取节假日数据。
type RemoteClient struct {
	baseURL string
	http    *http.Client
}

// NewRemoteClient 创建带超时控制的远程客户端。
func NewRemoteClient() *RemoteClient {
	return &RemoteClient{
		baseURL: remoteBaseURL,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// yearResponse 是远程 JSON 的响应结构。
type yearResponse struct {
	Days []DaySnapshot `json:"days"`
}

// FetchYearDays 拉取指定年份的节假日数据。
func (c *RemoteClient) FetchYearDays(ctx context.Context, year int) ([]DaySnapshot, error) {
	url := fmt.Sprintf("%s/%d.json", c.baseURL, year)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("构造 %d 年节假日请求失败: %w", year, err)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("拉取 %d 年节假日数据失败: %w", year, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("拉取 %d 年节假日数据失败: %d", year, resp.StatusCode)
	}

	var data yearResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("解析 %d 年节假日数据失败: %w", year, err)
	}
	// 校验远程响应结构
	if data.Days == nil {
		return nil, fmt.Errorf("%d 年节假日数据格式异常: 缺少 days 数组", year)
	}
	return data.Days, nil
}
