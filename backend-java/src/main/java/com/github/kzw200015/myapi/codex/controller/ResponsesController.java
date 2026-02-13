package com.github.kzw200015.myapi.codex.controller;

import java.io.IOException;
import java.util.Objects;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.github.kzw200015.myapi.common.model.ApiResponse;
import com.github.kzw200015.myapi.codex.model.CallLog;
import com.github.kzw200015.myapi.codex.service.CodexProxyExceptions.NoAvailableAccountException;
import com.github.kzw200015.myapi.codex.service.CodexProxyExceptions.UpstreamRequestFailedException;
import com.github.kzw200015.myapi.codex.service.CodexProxyService;
import com.github.kzw200015.myapi.codex.service.ResponseLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import tools.jackson.databind.json.JsonMapper;

@RestController
@Slf4j
@RequiredArgsConstructor
public class ResponsesController {
    private final CodexProxyService codexProxyService;
    private final ResponseLogService responseLogService;
    private final JsonMapper jsonMapper;

    @PostMapping("/api/responses")
    public void responses(HttpServletRequest request, HttpServletResponse response) throws IOException {
        byte[] body = request.getInputStream().readAllBytes();

        CallLog callLog;
        try {
            callLog = codexProxyService.proxyResponses(request, response, body);
        } catch (IllegalArgumentException ex) {
            writeJson(response, 400, ApiResponse.badRequest(ex.getMessage()));
            return;
        } catch (NoAvailableAccountException ex) {
            writeJson(response, 503, ApiResponse.of(503, null, ex.getMessage()));
            return;
        } catch (UpstreamRequestFailedException ex) {
            writeJson(response, 502, ApiResponse.of(502, null, Objects.toString(ex.getMessage(), "")));
            return;
        } catch (Exception ex) {
            writeJson(response, 500, ApiResponse.of(500, null, Objects.toString(ex.getMessage(), "")));
            return;
        }

        try {
            responseLogService.writeCallLog(callLog);
        } catch (Exception ex) {
            log.warn("写入 /api/responses 调用日志失败: {}", ex.getMessage());
        }
    }

    private void writeJson(HttpServletResponse response, int status, ApiResponse<?> payload) throws IOException {
        response.setStatus(status);
        response.setHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        jsonMapper.writeValue(response.getOutputStream(), payload);
    }
}
