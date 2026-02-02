package com.github.kzw200015.javaapi.aihub.codex.responses;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;

/**
 * 启动时拉取 opencode codex header 指令。
 */
@Component
@Slf4j
public class OpencodeCodexHeaderProvider {

    private static final String CODEX_HEADER_URL =
            "https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/session/prompt/codex_header.txt";

    private final OkHttpClient httpClient;
    @Getter
    private volatile String instructions = "";

    public OpencodeCodexHeaderProvider(OkHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    @PostConstruct
    public void load() {
        final Request request = new Request.Builder().url(CODEX_HEADER_URL).build();
        try (final Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IllegalStateException("status=" + response.code());
            }
            final ResponseBody body = response.body();
            final String content = body.string().trim();
            if (!StringUtils.hasText(content)) {
                throw new IllegalStateException("内容为空");
            }
            instructions = content;
            log.info("加载 codex 指令成功：length={}", content.length());
        } catch (IOException | IllegalStateException ex) {
            log.warn("拉取 codex 指令失败：{}", ex.getMessage());
        }
    }
}
