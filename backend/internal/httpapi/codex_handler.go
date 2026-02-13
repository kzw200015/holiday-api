package httpapi

import (
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"

	"myapi/internal/codex"
	"myapi/internal/codexproxy"
	"myapi/internal/ent"

	"github.com/gin-gonic/gin"
)

// CodexHandler 提供 Codex OAuth 相关接口。
type CodexHandler struct {
	service        *codex.Service
	responsesProxy *codexproxy.Service
}

func NewCodexHandler(service *codex.Service, responsesProxy *codexproxy.Service) *CodexHandler {
	return &CodexHandler{
		service:        service,
		responsesProxy: responsesProxy,
	}
}

func (h *CodexHandler) Register(router *gin.Engine) {
	router.POST("/api/codex/oauth/session", h.handleCreateOAuthSession)
	router.POST("/api/codex/oauth/complete", h.handleCompleteOAuth)
	router.GET("/api/codex/accounts", h.handleListAccounts)
	router.PUT("/api/codex/accounts/:accountId", h.handleUpdateAccount)
	router.POST("/api/responses", h.handleResponses)
}

type completeOAuthRequest struct {
	Name        string `json:"name" binding:"required"`
	RedirectURL string `json:"redirectUrl" binding:"required"`
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

	account, err := h.service.CompleteOAuth(c.Request.Context(), req.Name, req.RedirectURL)
	if err != nil {
		c.JSON(http.StatusBadRequest, BadRequest(err.Error()))
		return
	}
	c.JSON(http.StatusOK, Ok(account))
}

func (h *CodexHandler) handleListAccounts(c *gin.Context) {
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page <= 0 {
		c.JSON(http.StatusBadRequest, BadRequest("page 参数非法"))
		return
	}

	pageSize, err := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if err != nil || pageSize <= 0 {
		c.JSON(http.StatusBadRequest, BadRequest("pageSize 参数非法"))
		return
	}
	if pageSize > 200 {
		c.JSON(http.StatusBadRequest, BadRequest("pageSize 不能超过 200"))
		return
	}

	accounts, err := h.service.ListAccountsPage(c.Request.Context(), page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, InternalServerError("查询账户失败"))
		return
	}
	c.JSON(http.StatusOK, Ok(accounts))
}

type updateAccountRequest struct {
	Name string `json:"name" binding:"required"`
}

func (h *CodexHandler) handleUpdateAccount(c *gin.Context) {
	accountID := c.Param("accountId")

	var req updateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, BadRequest("请求体格式错误"))
		return
	}

	updated, err := h.service.UpdateAccount(c.Request.Context(), accountID, codex.UpdateAccountRequest{Name: req.Name})
	if err != nil {
		if ent.IsNotFound(err) {
			c.JSON(http.StatusNotFound, NotFound())
			return
		}
		c.JSON(http.StatusInternalServerError, InternalServerError("更新账户失败"))
		return
	}
	c.JSON(http.StatusOK, Ok(updated))
}

func (h *CodexHandler) handleResponses(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "读取请求体失败"})
		return
	}

	payload, err := codexproxy.ParseRequestPayload(body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}

	callLog, err := h.responsesProxy.ProxyResponses(c, body, payload)
	if err != nil {
		switch {
		case errors.Is(err, codexproxy.ErrNoAvailableAccount):
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "无可用 Codex 账户"})
		case errors.Is(err, codexproxy.ErrUpstreamRequestFail):
			c.JSON(http.StatusBadGateway, gin.H{"error": "调用上游 Codex 失败"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "代理请求失败"})
		}
		return
	}

	if err = h.responsesProxy.WriteCallLog(c.Request.Context(), callLog); err != nil {
		log.Printf("写入 /api/responses 调用日志失败: %v", err)
	}
}
