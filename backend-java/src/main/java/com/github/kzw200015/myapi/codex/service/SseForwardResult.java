package com.github.kzw200015.myapi.codex.service;

import java.util.concurrent.CompletableFuture;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

public record SseForwardResult(SseEmitter emitter, CompletableFuture<TokenUsage> usageFuture) {}
