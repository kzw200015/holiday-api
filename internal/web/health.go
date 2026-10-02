package web

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/labstack/echo/v5"
)

// healthRoutes 挂上给 Kubernetes 的探针，只看状态码。
//
// 端口在迁移与启动时的节假日刷新都做完后才开始监听，所以连得上就说明启动完了，启动期的等待交给 startupProbe。
func healthRoutes(group *echo.Group, pool *pgxpool.Pool) {
	// liveness：进程还能处理请求。不碰任何依赖：数据库出故障时重启 Pod 也没用，
	// 所有 Pod 一齐重启、又因为连不上库起不来，只会越重启越糟
	group.GET("/live", func(c *echo.Context) error {
		return c.NoContent(http.StatusOK)
	})
	// readiness：数据库连得上才接流量，节假日查询离不开它。出网的节假日数据源不算在内，
	// 它出故障时换一个 Pod 也一样。不另设超时，由探针自己的 timeoutSeconds 计
	group.GET("/ready", func(c *echo.Context) error {
		if err := pool.Ping(c.Request().Context()); err != nil {
			return &Error{Status: http.StatusServiceUnavailable, Code: DatabaseUnavailable, Message: "数据库连不上", Cause: err}
		}
		return c.NoContent(http.StatusOK)
	})
}
