package com.github.kzw200015.myapi.httpapi;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * /api 路径下未命中的路由统一返回 404（与原 Gin NoRoute 行为一致）。
 */
@RestController
public class ApiNoRouteController {
    @RequestMapping({"/api", "/api/**"})
    public ResponseEntity<ApiResponse<?>> apiNotFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.notFound());
    }
}
