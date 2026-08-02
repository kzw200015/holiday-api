package server

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"myapi/internal/apiresponse"
)

// requestLogger 记录每个请求的方法、路径、状态码与耗时。
func requestLogger(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		logger.Info("请求完成",
			slog.String("method", c.Request.Method),
			slog.String("path", c.Request.URL.Path),
			slog.Int("status", c.Writer.Status()),
			slog.Duration("latency", time.Since(start)),
		)
	}
}

// errorHandler 统一处理 handler 通过 c.Error 上报的错误，返回统一 JSON 结构。
func errorHandler(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// 响应已写出（例如参数校验的 400）时不再覆盖
		if len(c.Errors) == 0 || c.Writer.Written() {
			return
		}
		err := c.Errors.Last().Err
		logger.Error("未捕获异常", slog.Any("error", err), slog.String("path", c.Request.URL.Path))
		c.AbortWithStatusJSON(http.StatusInternalServerError, apiresponse.InternalServerError(err.Error()))
	}
}

// recovery 捕获 panic 并返回统一 JSON 结构。
func recovery(logger *slog.Logger) gin.HandlerFunc {
	return gin.CustomRecoveryWithWriter(nil, func(c *gin.Context, recovered any) {
		logger.Error("请求处理 panic", slog.Any("panic", recovered), slog.String("path", c.Request.URL.Path))
		c.AbortWithStatusJSON(http.StatusInternalServerError, apiresponse.InternalServerError("Internal Server Error"))
	})
}
