package com.github.kzw200015.javaapi.common;

import java.time.Duration;
import okhttp3.OkHttpClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * HTTP 客户端配置。
 */
@Configuration
public class OkHttpClientConfig {

    /** HTTP 超时时间。 */
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    /**
     * 共享 OkHttpClient。
     */
    @Bean
    public OkHttpClient okHttpClient() {
        return new OkHttpClient.Builder()
            .connectTimeout(TIMEOUT)
            .readTimeout(TIMEOUT)
            .build();
    }
}
