package com.github.kzw200015.myapi.codex.service;

public record HttpForwardResult(int statusCode, byte[] responseBody, TokenUsage usage) {}
