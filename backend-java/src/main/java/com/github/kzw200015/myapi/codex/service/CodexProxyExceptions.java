package com.github.kzw200015.myapi.codex.service;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class CodexProxyExceptions {
    public static class NoAvailableAccountException extends RuntimeException {
        public NoAvailableAccountException() {
            super("no available codex account");
        }
    }

    public static class UpstreamRequestFailedException extends RuntimeException {
        public UpstreamRequestFailedException(Throwable cause) {
            super("upstream request failed", cause);
        }

        public UpstreamRequestFailedException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
