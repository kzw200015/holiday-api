// Package server 负责组装 HTTP 路由与中间件。
package server

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"

	"myapi/internal/apiresponse"
	"myapi/internal/holiday"
	"myapi/internal/web"
)

// New 构建并返回配置完成的 gin 引擎。
func New(logger *slog.Logger, holidayHandler *holiday.Handler) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)

	engine := gin.New()
	engine.Use(recovery(logger), requestLogger(logger), errorHandler(logger))

	// 前端资源已通过 go:embed 编入二进制，命中的请求由该中间件直接返回。
	// 前端使用 hash 路由，服务端只会收到 "/"，无需 SPA 回退。
	staticFS, err := static.EmbedFolder(web.Embedded, web.DistDir)
	if err != nil {
		// dist 目录由 go:embed 保证存在，构建期即可确定，运行期不会失败
		panic(err)
	}
	engine.Use(static.Serve("/", staticFS))

	// 挂载节假日路由
	holidayHandler.RegisterRoutes(engine.Group("/api/holiday"))

	// 未匹配的 /api/* 返回统一 JSON 格式，其余保持默认 404
	engine.NoRoute(func(c *gin.Context) {
		urlPath := c.Request.URL.Path
		if urlPath == "/api" || strings.HasPrefix(urlPath, "/api/") {
			c.JSON(http.StatusNotFound, apiresponse.NotFound())
			return
		}
		c.Status(http.StatusNotFound)
	})

	return engine
}
