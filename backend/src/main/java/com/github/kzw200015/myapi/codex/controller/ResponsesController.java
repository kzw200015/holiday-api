package com.github.kzw200015.myapi.codex.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotNull;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;

import com.github.kzw200015.myapi.codex.service.proxy.CodexProxyService;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.node.ObjectNode;

@RestController
@RequiredArgsConstructor
@Validated
public class ResponsesController {
    private final CodexProxyService codexProxyService;

    @PostMapping("/api/responses")
    public Object responses(HttpServletRequest request, @RequestBody @NotNull ObjectNode body) {
        return codexProxyService.proxyResponses(request, body);
    }
}
