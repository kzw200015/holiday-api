package com.github.kzw200015.javaapi.aihub.codex.responses;

import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;

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

    @PostMapping(value = "/responses")
    public Object responses(@RequestHeader HttpHeaders headers, @RequestBody(required = false) Map<String, Object> body) {
        if (Boolean.TRUE.equals(body.get("stream"))) {
            return responsesSseProxyService.proxySse(headers, body);
        }
        return responsesJsonProxyService.proxyJson(headers, body);
    }
}
