package com.github.kzw200015.javaapi.aihub.codex.responses;

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
public class ResponsesController {

    private final ResponsesJsonProxyService responsesJsonProxyService;
    private final ResponsesSseProxyService responsesSseProxyService;

    public ResponsesController(ResponsesJsonProxyService responsesJsonProxyService,
                               ResponsesSseProxyService responsesSseProxyService) {
        this.responsesJsonProxyService = responsesJsonProxyService;
        this.responsesSseProxyService = responsesSseProxyService;
    }

    @PostMapping(value = "/responses", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> responsesJson(@RequestHeader HttpHeaders headers, @RequestBody(required = false) Map<String, Object> body) {
        return responsesJsonProxyService.proxyJson(headers, body);
    }

    @PostMapping(value = "/responses", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter responsesSse(@RequestHeader HttpHeaders headers, @RequestBody(required = false) Map<String, Object> body) {
        return responsesSseProxyService.proxySse(headers, body);
    }
}
