package com.github.kzw200015.myapi.codex.exception;

/**
 * 没有可用 Codex 账号时抛出。
 */
public class NoAvailableAccountException extends RuntimeException {
    public NoAvailableAccountException() {
        super("no available codex account");
    }
}
