// Package outbound 是出网：本进程访问外部网站（节假日数据源）一律经 [NewClient] 建出的客户端。
package outbound

import (
	"net"
	"net/http"
	"time"

	"github.com/kzw200015/myapi/internal/config"
)

// connectTimeout 是连不上时多久放弃
const connectTimeout = 10 * time.Second

// NewClient 建出出网客户端：所有请求共用同一个 User-Agent；OUTBOUND_TIMEOUT 管整个请求，从连接到读完响应体。
//
// 不跟随重定向，调用方自己看 3xx（数据源不该重定向，按失败处理）：跟随的话，外部网站就能把请求引到别处，包括内网。
// 代理照 Go 的惯例读 HTTPS_PROXY、NO_PROXY 这些环境变量。
func NewClient(cfg config.Config) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{Timeout: connectTimeout, KeepAlive: 30 * time.Second}).DialContext
	return &http.Client{
		Transport: userAgentTransport{base: transport, userAgent: cfg.OutboundUserAgent},
		Timeout:   cfg.OutboundTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// userAgentTransport 给每个请求带上同一个 User-Agent。
type userAgentTransport struct {
	base      http.RoundTripper
	userAgent string
}

func (t userAgentTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	request = request.Clone(request.Context())
	request.Header.Set("User-Agent", t.userAgent)
	return t.base.RoundTrip(request)
}
