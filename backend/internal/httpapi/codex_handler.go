package httpapi

import (
	"net/http"

	"myapi/internal/codex"

	"github.com/gin-gonic/gin"
)

// CodexHandler 提供 Codex OAuth 相关接口。
type CodexHandler struct {
	service *codex.Service
}

func NewCodexHandler(service *codex.Service) *CodexHandler {
	return &CodexHandler{service: service}
}

func (h *CodexHandler) Register(router *gin.Engine) {
	router.POST("/api/codex/oauth/session", h.handleCreateOAuthSession)
	router.POST("/api/codex/oauth/complete", h.handleCompleteOAuth)
	router.GET("/api/codex/accounts", h.handleListAccounts)
}

type completeOAuthRequest struct {
	RedirectURL string `json:"redirectUrl"`
}

func (h *CodexHandler) handleCreateOAuthSession(c *gin.Context) {
	info, err := h.service.CreateOAuthSession(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, InternalServerError("创建 OAuth 链接失败"))
		return
	}
	c.JSON(http.StatusOK, Ok(info))
}

func (h *CodexHandler) handleCompleteOAuth(c *gin.Context) {
	var req completeOAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, BadRequest("请求体格式错误"))
		return
	}

	account, err := h.service.CompleteOAuth(c.Request.Context(), req.RedirectURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, BadRequest(err.Error()))
		return
	}
	c.JSON(http.StatusOK, Ok(account))
}

func (h *CodexHandler) handleListAccounts(c *gin.Context) {
	accounts, err := h.service.ListAccounts(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, InternalServerError("查询账户失败"))
		return
	}
	c.JSON(http.StatusOK, Ok(accounts))
}
