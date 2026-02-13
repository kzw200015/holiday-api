package com.github.kzw200015.myapi.codexproxy;

public final class CodexProxyExceptions {
    private CodexProxyExceptions() {}

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
