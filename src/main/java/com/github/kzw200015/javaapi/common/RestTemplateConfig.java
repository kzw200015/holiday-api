package com.github.kzw200015.javaapi.common;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * HTTP 客户端配置。
 */
@Configuration
public class RestTemplateConfig {

    /** HTTP 超时时间。 */
    private static final int TIMEOUT_MILLIS = 10_000;

    /**
     * 共享 RestTemplate。
     */
    @Bean
    public RestTemplate restTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(TIMEOUT_MILLIS);
        factory.setReadTimeout(TIMEOUT_MILLIS);
        return new RestTemplate(factory);
    }
}
