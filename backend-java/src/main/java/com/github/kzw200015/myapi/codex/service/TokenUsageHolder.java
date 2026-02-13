package com.github.kzw200015.myapi.codex.service;

/**
 * SSE 事件流解析期间用于累计 usage 的可变容器。
 */
public class TokenUsageHolder {
    private int inputTokens;
    private int cachedInputTokens;
    private int outputTokens;

    void set(int inputTokens, int cachedInputTokens, int outputTokens) {
        this.inputTokens = inputTokens;
        this.cachedInputTokens = cachedInputTokens;
        this.outputTokens = outputTokens;
    }

    TokenUsage toUsage() {
        return new TokenUsage(inputTokens, cachedInputTokens, outputTokens);
    }
}
