package com.github.kzw200015.javaapi.aihub.codex.responses;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

/**
 * /api/responses 反向代理。
 */
@RestController
@RequestMapping("/api")
@Slf4j
public class StreamController {

    private final ResponsesProxyService responsesProxyService;

    public StreamController(ResponsesProxyService responsesProxyService) {
        this.responsesProxyService = responsesProxyService;
    }

    @PostMapping(value = "/responses", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> responsesJson(@RequestHeader HttpHeaders headers, @RequestBody(required = false) Map<String, Object> body) {
        return responsesProxyService.proxyJson(headers, body);
    }

    @PostMapping(value = "/responses", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter responsesSse(@RequestHeader HttpHeaders headers, @RequestBody(required = false) Map<String, Object> body) {
        log.info(headers.toString());
        return responsesProxyService.proxySse(headers, body);
    }
}
