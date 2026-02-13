package httpapi

import (
	"errors"
	"io"
	"log"
	"net/http"

	"myapi/internal/codex"
	"myapi/internal/codexproxy"
	"myapi/internal/ent"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
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
	router.GET("/api/codex/response-logs", h.handleListResponseLogs)
	router.POST("/api/responses", h.handleResponses)
}

type completeOAuthRequest struct {
	Name        string `json:"name" binding:"required"`
	RedirectURL string `json:"redirectUrl" binding:"required"`
}

type accountsPaginationQuery struct {
	Page     int `form:"page,default=1" binding:"min=1"`
	PageSize int `form:"pageSize,default=10" binding:"min=1,max=200"`
}

type responseLogsPaginationQuery struct {
	Page     int `form:"page,default=1" binding:"min=1"`
	PageSize int `form:"pageSize,default=20" binding:"min=1,max=200"`
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
	var query accountsPaginationQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		c.JSON(http.StatusBadRequest, BadRequest("请求参数错误"))
		return
	}

	accounts, err := h.service.ListAccountsPage(c.Request.Context(), query.Page, query.PageSize)
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
	var payload codexproxy.RequestPayload
	if err := c.ShouldBindBodyWith(&payload, binding.JSON); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体格式错误"})
		return
	}

	body, err := resolveRawBody(c)
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

func (h *CodexHandler) handleListResponseLogs(c *gin.Context) {
	var query responseLogsPaginationQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		c.JSON(http.StatusBadRequest, BadRequest("请求参数错误"))
		return
	}

	logsPage, err := h.responsesProxy.ListResponseLogsPage(c.Request.Context(), query.Page, query.PageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, InternalServerError("查询调用日志失败"))
		return
	}
	c.JSON(http.StatusOK, Ok(logsPage))
}

func resolveRawBody(c *gin.Context) ([]byte, error) {
	if value, exists := c.Get(gin.BodyBytesKey); exists {
		if body, ok := value.([]byte); ok && len(body) > 0 {
			return body, nil
		}
	}
	return io.ReadAll(c.Request.Body)
}
