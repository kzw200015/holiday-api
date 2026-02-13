package com.github.kzw200015.myapi.codex.controller;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.github.kzw200015.myapi.codex.service.CodexProxyService;
import lombok.RequiredArgsConstructor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequiredArgsConstructor
public class ResponsesController {
    private final CodexProxyService codexProxyService;
    private final JsonMapper jsonMapper;

    @PostMapping("/api/responses")
    public Object responses(HttpServletRequest request) throws Exception {
        JsonNode body = jsonMapper.readTree(request.getInputStream().readAllBytes());
        return codexProxyService.proxyResponses(request, body);
    }
}
