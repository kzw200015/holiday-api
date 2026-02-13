package codexproxy

import (
	"net/http"
	"testing"
)

// TestStickySessionBindingCRUD 验证粘滞绑定的写入、读取和删除。
func TestStickySessionBindingCRUD(t *testing.T) {
	stickyService := NewStickySessionService(defaultStickyTTL)
	stickyService.SetBinding("sticky-key", "account-id")

	accountID, found := stickyService.GetBindingAccountID("sticky-key")
	if !found {
		t.Fatalf("expected sticky binding to exist")
	}
	if accountID != "account-id" {
		t.Fatalf("expected account-id, got %s", accountID)
	}

	stickyService.DeleteBinding("sticky-key")
	_, found = stickyService.GetBindingAccountID("sticky-key")
	if found {
		t.Fatalf("expected sticky binding to be deleted")
	}
}

// TestExtractStickyKeyPriority 验证粘滞键提取优先级。
func TestExtractStickyKeyPriority(t *testing.T) {
	stickyService := NewStickySessionService(defaultStickyTTL)

	headers := http.Header{}
	headers.Set("session_id", "session-value")
	headers.Set("conversation_id", "conversation-value")
	sticky := stickyService.ExtractKey(headers, "prompt-value")
	if sticky != stickyService.HashValue("session-value") {
		t.Fatalf("expected session_id priority")
	}

	headers.Del("session_id")
	sticky = stickyService.ExtractKey(headers, "prompt-value")
	if sticky != stickyService.HashValue("conversation-value") {
		t.Fatalf("expected conversation_id priority")
	}

	headers.Del("conversation_id")
	sticky = stickyService.ExtractKey(headers, "prompt-value")
	if sticky != stickyService.HashValue("prompt-value") {
		t.Fatalf("expected prompt_cache_key fallback")
	}
}

// TestParseUsageFromResponseBody 验证普通响应 usage 提取逻辑。
func TestParseUsageFromResponseBody(t *testing.T) {
	body := []byte(`{"usage":{"input_tokens":120,"output_tokens":30,"input_tokens_details":{"cached_tokens":40}}}`)
	usage := parseUsageFromResponseBody(body)
	if usage.InputTokens != 120 {
		t.Fatalf("expected input tokens 120, got %d", usage.InputTokens)
	}
	if usage.CachedInputTokens != 40 {
		t.Fatalf("expected cached input tokens 40, got %d", usage.CachedInputTokens)
	}
	if usage.OutputTokens != 30 {
		t.Fatalf("expected output tokens 30, got %d", usage.OutputTokens)
	}
}

// TestUpdateUsageFromSSEEventData 验证 SSE usage 提取逻辑。
func TestUpdateUsageFromSSEEventData(t *testing.T) {
	rawJSON := "{\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":88,\"output_tokens\":22,\"input_tokens_details\":{\"cached_tokens\":11}}}}"
	usage := tokenUsage{}
	updateUsageFromSSEEventData(rawJSON, &usage)

	if usage.InputTokens != 88 {
		t.Fatalf("expected input tokens 88, got %d", usage.InputTokens)
	}
	if usage.CachedInputTokens != 11 {
		t.Fatalf("expected cached input tokens 11, got %d", usage.CachedInputTokens)
	}
	if usage.OutputTokens != 22 {
		t.Fatalf("expected output tokens 22, got %d", usage.OutputTokens)
	}
}
