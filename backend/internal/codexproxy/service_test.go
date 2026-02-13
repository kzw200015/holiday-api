package codexproxy

import (
	"net/http"
	"testing"
)

func TestParseRequestPayload(t *testing.T) {
	payload, err := ParseRequestPayload([]byte(`{"stream":true,"prompt_cache_key":"abc"}`))
	if err != nil {
		t.Fatalf("ParseRequestPayload returned error: %v", err)
	}
	if !payload.Stream {
		t.Fatalf("expected stream=true")
	}
	if payload.PromptCacheKey != "abc" {
		t.Fatalf("expected prompt_cache_key=abc, got %s", payload.PromptCacheKey)
	}
}

func TestParseRequestPayloadInvalidJSON(t *testing.T) {
	_, err := ParseRequestPayload([]byte(`{invalid`))
	if err == nil {
		t.Fatalf("expected error for invalid JSON")
	}
}

func TestExtractStickyKeyPriority(t *testing.T) {
	headers := http.Header{}
	headers.Set("session_id", "session-value")
	headers.Set("conversation_id", "conversation-value")
	sticky := extractStickyKey(headers, "prompt-value")
	if sticky != hashStickyValue("session-value") {
		t.Fatalf("expected session_id priority")
	}

	headers.Del("session_id")
	sticky = extractStickyKey(headers, "prompt-value")
	if sticky != hashStickyValue("conversation-value") {
		t.Fatalf("expected conversation_id priority")
	}

	headers.Del("conversation_id")
	sticky = extractStickyKey(headers, "prompt-value")
	if sticky != hashStickyValue("prompt-value") {
		t.Fatalf("expected prompt_cache_key fallback")
	}
}

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

func TestUpdateUsageFromSSEDataLine(t *testing.T) {
	line := "data: {\"type\":\"response.completed\",\"response\":{\"usage\":{\"input_tokens\":88,\"output_tokens\":22,\"input_tokens_details\":{\"cached_tokens\":11}}}}\n"
	usage := tokenUsage{}
	updateUsageFromSSEDataLine(line, &usage)

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
