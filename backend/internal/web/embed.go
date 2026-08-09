// Package web 以 go:embed 将前端构建产物内嵌进二进制，
// 运行时无需依赖磁盘上的静态资源目录。
//
// dist 目录的内容由前端构建产物填充（见 Dockerfile 的 backend-builder 阶段），
// 仓库中只保留 .gitkeep 占位，因此本地直接运行时没有前端页面可服务，
// 前端开发请使用 vite dev server。
package web

import "embed"

// DistDir 是 Embedded 中前端产物所在的子目录。
const DistDir = "dist"

//go:embed all:dist
var Embedded embed.FS
