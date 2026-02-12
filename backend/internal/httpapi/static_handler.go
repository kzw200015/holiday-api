package httpapi

import (
	"embed"
	"errors"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// frontendDistFS 内嵌前端构建产物目录。
//
//go:embed webdist/*
var frontendDistFS embed.FS

// RegisterFrontend 注册前端静态资源与单页应用回退路由。
func RegisterFrontend(router *gin.Engine) {
	distFS, err := fs.Sub(frontendDistFS, "webdist")
	if err != nil {
		panic(err)
	}

	indexHTML, err := fs.ReadFile(distFS, "index.html")
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return
		}
		panic(err)
	}
	fileServer := http.FileServerFS(distFS)
	router.NoRoute(func(c *gin.Context) {
		requestPath := c.Request.URL.Path
		if requestPath == "/api" || strings.HasPrefix(requestPath, "/api/") {
			c.JSON(http.StatusNotFound, ApiResponse[any]{
				Code: http.StatusNotFound,
				Msg:  http.StatusText(http.StatusNotFound),
			})
			return
		}

		staticPath := strings.TrimPrefix(requestPath, "/")
		if staticPath == "" {
			c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
			return
		}

		if _, statErr := fs.Stat(distFS, staticPath); statErr == nil {
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}

		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})
}
