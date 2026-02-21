package com.github.kzw200015.myapi.codex.exception;

/**
 * 更新账号时未找到目标账号。
 */
public class AccountNotFoundException extends RuntimeException {
    public AccountNotFoundException() {
        super("account not found");
    }
}
