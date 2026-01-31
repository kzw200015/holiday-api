package com.github.kzw200015.javaapi.responses;

import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import okhttp3.sse.EventSource;
import okhttp3.sse.EventSourceListener;
import okhttp3.sse.EventSources;
import org.jspecify.annotations.NonNull;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * /api/responses 反向代理服务。
 */
@Service
@Slf4j
public class ResponsesProxyService {

    private static final HttpUrl UPSTREAM_URL = HttpUrl.get("https://sub2api.home.jktu.cc/responses");

    private static final Duration STREAM_READ_TIMEOUT = Duration.ZERO;

    private static final String HEADER_X_CODEX_BETA_FEATURES = "x-codex-beta-features";
    private static final String HEADER_X_OAI_WEB_SEARCH_ELIGIBLE = "x-oai-web-search-eligible";
    private static final String HEADER_SESSION_ID = "session_id";
    private static final String HEADER_ORIGINATOR = "originator";

    private static final List<String> WHITELIST_HEADERS = List.of(
            HEADER_X_CODEX_BETA_FEATURES,
            HEADER_X_OAI_WEB_SEARCH_ELIGIBLE,
            HEADER_SESSION_ID,
            HttpHeaders.AUTHORIZATION,
            HttpHeaders.USER_AGENT,
            HEADER_ORIGINATOR
    );

    private final OkHttpClient okHttpClient;
    private final JsonMapper jsonMapper;

    public ResponsesProxyService(OkHttpClient okHttpClient, JsonMapper jsonMapper) {
        this.okHttpClient = okHttpClient;
        this.jsonMapper = jsonMapper;
    }

    public Map<String, Object> proxyJson(HttpHeaders headers, Map<String, Object> body) {
        final Request upstreamRequest = buildUpstreamRequest(headers, body);
        try (final Response upstreamResponse = okHttpClient.newCall(upstreamRequest).execute()) {
            if (!upstreamResponse.isSuccessful()) {
                throw new IllegalStateException("代理请求失败：status=" + upstreamResponse.code());
            }
            final ResponseBody upstreamBody = upstreamResponse.body();
            final byte[] responseBody = upstreamBody.bytes();
            return jsonMapper.readValue(responseBody, new TypeReference<>() {
            });
        } catch (IOException ex) {
            throw new IllegalStateException("代理请求失败", ex);
        }
    }

    public SseEmitter proxySse(HttpHeaders headers, Map<String, Object> body) {
        final OkHttpClient client = okHttpClient.newBuilder().readTimeout(STREAM_READ_TIMEOUT).build();
        final Request upstreamRequest = buildSseUpstreamRequest(headers, body);

        final SseEmitter emitter = new SseEmitter(60_000L);

        final EventSourceListener listener = new EventSourceListener() {

            @Override
            public void onEvent(@NonNull EventSource eventSource, String id, String type, @NonNull String data) {
                try {
                    final SseEmitter.SseEventBuilder event = SseEmitter.event();
                    if (StringUtils.hasText(id)) {
                        event.id(id);
                    }
                    if (StringUtils.hasText(type)) {
                        event.name(type);
                    }
                    emitter.send(event.data(data));
                } catch (Exception ex) {
                    eventSource.cancel();
                    emitter.completeWithError(ex);
                }
            }

            @Override
            public void onClosed(@NonNull EventSource eventSource) {
                emitter.complete();
            }

            @Override
            public void onFailure(EventSource eventSource, Throwable t, Response response) {
                eventSource.cancel();
                if (t == null) {
                    emitter.complete();
                    return;
                }
                emitter.completeWithError(t);
            }
        };

        final EventSource eventSource = EventSources.createFactory(client).newEventSource(upstreamRequest, listener);

        emitter.onCompletion(eventSource::cancel);
        emitter.onTimeout(() -> {
            eventSource.cancel();
            emitter.complete();
        });

        return emitter;
    }

    private Request buildUpstreamRequest(HttpHeaders headers, Map<String, Object> body) {
        final RequestBody requestBody = RequestBody.create(jsonMapper.writeValueAsBytes(body));
        final Request.Builder builder = new Request.Builder().url(UPSTREAM_URL).post(requestBody);
        builder.header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        copyWhitelistedHeaders(builder, headers);
        return builder.build();
    }

    private Request buildSseUpstreamRequest(HttpHeaders headers, Map<String, Object> body) {
        final RequestBody requestBody = RequestBody.create(jsonMapper.writeValueAsBytes(body));
        final Request.Builder builder = new Request.Builder().url(UPSTREAM_URL).post(requestBody);
        builder.header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        builder.header(HttpHeaders.ACCEPT, MediaType.TEXT_EVENT_STREAM_VALUE);
        copyWhitelistedHeaders(builder, headers);
        return builder.build();
    }

    private static void copyWhitelistedHeaders(Request.Builder builder, HttpHeaders headers) {
        for (String headerName : WHITELIST_HEADERS) {
            copyHeader(builder, headers, headerName);
        }
    }

    private static void copyHeader(Request.Builder builder, HttpHeaders headers, String headerName) {
        final List<String> values = headers.get(headerName);
        if (values == null || values.isEmpty()) {
            return;
        }

        builder.header(headerName, values.getFirst());
        for (int i = 1; i < values.size(); i++) {
            builder.addHeader(headerName, values.get(i));
        }
    }

}
