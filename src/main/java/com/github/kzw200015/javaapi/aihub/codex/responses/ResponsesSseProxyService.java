package com.github.kzw200015.javaapi.aihub.codex.responses;

import com.github.kzw200015.javaapi.aihub.AccountUsageService;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexAccountCache;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexOAuthProperties;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import okhttp3.sse.EventSource;
import okhttp3.sse.EventSourceListener;
import okhttp3.sse.EventSources;
import okio.BufferedSource;
import org.jspecify.annotations.NonNull;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.json.JsonMapper;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

@Service
@Slf4j
public class ResponsesSseProxyService extends AbstractResponsesProxy {

    private static final Duration STREAM_READ_TIMEOUT = Duration.ZERO;

    private final JsonMapper jsonMapper;
    private final AccountUsageService accountUsageService;
    private final OkHttpClient streamHttpClient;

    public ResponsesSseProxyService(OkHttpClient httpClient, JsonMapper jsonMapper,
                                    CodexOAuthProperties codexOAuthProperties, CodexAccountCache codexAccountCache,
                                    AccountUsageService accountUsageService) {
        super(codexOAuthProperties, codexAccountCache);
        this.jsonMapper = jsonMapper;
        this.accountUsageService = accountUsageService;
        this.streamHttpClient = httpClient.newBuilder()
                .readTimeout(STREAM_READ_TIMEOUT)
                .addNetworkInterceptor(chain -> {
                    final Request request = chain.request();
                    final String accept = request.header(HttpHeaders.ACCEPT);
                    final Response response = chain.proceed(request);
                    if (!StringUtils.hasText(accept) || !accept.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) {
                        return response;
                    }

                    final String contentType = response.header(HttpHeaders.CONTENT_TYPE);
                    if (StringUtils.hasText(contentType)) {
                        return response;
                    }

                    return response.newBuilder()
                            .header(HttpHeaders.CONTENT_TYPE, MediaType.TEXT_EVENT_STREAM_VALUE)
                            .body(new ResponseBody() {
                                @Override
                                public okhttp3.MediaType contentType() {
                                    return okhttp3.MediaType.get(MediaType.TEXT_EVENT_STREAM_VALUE);
                                }

                                @Override
                                public long contentLength() {
                                    return response.body().contentLength();
                                }

                                @Override
                                public @NonNull BufferedSource source() {
                                    return response.body().source();
                                }
                            })
                            .build();
                })
                .build();
    }

    public SseEmitter proxySse(HttpHeaders headers, Map<String, Object> body) {
        final Map<String, Object> payload = body != null ? body : new HashMap<>();
        payload.put("stream", true);
        final CodexAccountCache.CachedAccount auth = resolveAuth(headers);
        final Request upstreamRequest = buildUpstreamRequest(headers, payload, auth);
        final SseEmitter emitter = new SseEmitter(60_000L);

        final UsageSseListener listener = new UsageSseListener(emitter, jsonMapper, accountUsageService, auth.id());

        final EventSource eventSource = EventSources.createFactory(streamHttpClient).newEventSource(upstreamRequest, listener);

        emitter.onCompletion(() -> {
            eventSource.cancel();
            listener.finish();
        });
        emitter.onTimeout(() -> {
            eventSource.cancel();
            listener.finish();
            emitter.complete();
        });

        return emitter;
    }

    private Request buildUpstreamRequest(HttpHeaders headers, Map<String, Object> body, CodexAccountCache.CachedAccount auth) {
        final RequestBody requestBody = RequestBody.create(jsonMapper.writeValueAsBytes(body));
        final Request.Builder builder = new Request.Builder().url(UPSTREAM_URL).post(requestBody);
        builder.header(HttpHeaders.ACCEPT, MediaType.TEXT_EVENT_STREAM_VALUE);
        copyWhitelistedHeaders(builder, headers);
        applyAuthHeaders(builder, headers, auth);
        return builder.build();
    }

    private static final class UsageSseListener extends EventSourceListener {

        private final SseEmitter emitter;
        private final JsonMapper jsonMapper;
        private final AccountUsageService usageService;
        private final String accountId;
        private final long startedNanos;

        private final AtomicInteger upstreamStatus = new AtomicInteger();
        private final AtomicReference<TokenUsage> tokenUsage = new AtomicReference<>();
        private final AtomicBoolean logged = new AtomicBoolean(false);

        private UsageSseListener(SseEmitter emitter, JsonMapper jsonMapper, AccountUsageService usageService, String accountId) {
            this.emitter = emitter;
            this.jsonMapper = jsonMapper;
            this.usageService = usageService;
            this.accountId = accountId;
            this.startedNanos = System.nanoTime();
        }

        @Override
        public void onOpen(@NonNull EventSource eventSource, @NonNull Response response) {
            upstreamStatus.set(response.code());
        }

        @Override
        public void onEvent(@NonNull EventSource eventSource, String id, String type, @NonNull String data) {
            final TokenUsage usage = AbstractResponsesProxy.parseSseUsage(jsonMapper, data);
            if (usage != null) {
                tokenUsage.set(usage);
            }
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
                finish();
                emitter.completeWithError(ex);
            }
        }

        @Override
        public void onClosed(@NonNull EventSource eventSource) {
            finish();
            emitter.complete();
        }

        @Override
        public void onFailure(EventSource eventSource, Throwable t, Response response) {
            eventSource.cancel();
            if (response != null) {
                upstreamStatus.set(response.code());
            }
            finish();
            if (t == null) {
                emitter.complete();
                return;
            }
            log.error("代理 SSE 请求失败：status={}, error={}", response != null ? response.code() : null, t.getMessage());
            emitter.completeWithError(t);
        }

        private void finish() {
            if (!logged.compareAndSet(false, true)) {
                return;
            }
            final long costMs = Duration.ofNanos(System.nanoTime() - startedNanos).toMillis();
            final TokenUsage usage = tokenUsage.get();
            usageService.saveUsage(accountId, true,
                    upstreamStatus.get() > 0 ? upstreamStatus.get() : null,
                    usage != null ? usage.inputTokens() : null,
                    usage != null ? usage.cachedInputTokens() : null,
                    usage != null ? usage.outputTokens() : null,
                    costMs);
        }
    }
}
