package codexproxy

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"
)

type stickyBinding struct {
	AccountID string
	ExpiresAt time.Time
}

// StickySessionService 负责管理粘性会话键生成与账号绑定关系。
type StickySessionService struct {
	stickyTTL time.Duration
	stickyMu  sync.Mutex
	bindings  map[string]stickyBinding
}

// NewStickySessionService 创建粘性会话服务。
func NewStickySessionService(stickyTTL time.Duration) *StickySessionService {
	return &StickySessionService{
		stickyTTL: stickyTTL,
		bindings:  make(map[string]stickyBinding),
	}
}

// ExtractKey 按优先级生成账户粘滞键。
func (s *StickySessionService) ExtractKey(headers http.Header, promptCacheKey string) string {
	sessionID := strings.TrimSpace(headers.Get("session_id"))
	if sessionID != "" {
		return s.HashValue(sessionID)
	}

	conversationID := strings.TrimSpace(headers.Get("conversation_id"))
	if conversationID != "" {
		return s.HashValue(conversationID)
	}

	if strings.TrimSpace(promptCacheKey) != "" {
		return s.HashValue(promptCacheKey)
	}
	return ""
}

// HashValue 计算粘滞键的固定哈希值。
func (s *StickySessionService) HashValue(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// SetBinding 记录粘滞键与账户的绑定关系。
func (s *StickySessionService) SetBinding(stickyKey string, accountID string) {
	s.stickyMu.Lock()
	defer s.stickyMu.Unlock()
	s.bindings[stickyKey] = stickyBinding{
		AccountID: accountID,
		ExpiresAt: time.Now().Add(s.stickyTTL),
	}
}

// GetBindingAccountID 读取并校验粘滞绑定是否仍在有效期内。
func (s *StickySessionService) GetBindingAccountID(stickyKey string) (string, bool) {
	s.stickyMu.Lock()
	defer s.stickyMu.Unlock()

	binding, found := s.bindings[stickyKey]
	if !found {
		return "", false
	}
	if time.Now().After(binding.ExpiresAt) {
		delete(s.bindings, stickyKey)
		return "", false
	}
	return binding.AccountID, true
}

// DeleteBinding 删除指定粘滞绑定。
func (s *StickySessionService) DeleteBinding(stickyKey string) {
	s.stickyMu.Lock()
	defer s.stickyMu.Unlock()
	delete(s.bindings, stickyKey)
}
