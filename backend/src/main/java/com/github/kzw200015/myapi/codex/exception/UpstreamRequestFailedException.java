package com.github.kzw200015.myapi.codex.exception;

/**
 * 上游请求失败时抛出。
 */
public class UpstreamRequestFailedException extends RuntimeException {
    public UpstreamRequestFailedException(Throwable cause) {
        super("upstream request failed", cause);
    }

    public UpstreamRequestFailedException(String message) {
        super(message);
    }

    public UpstreamRequestFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}
