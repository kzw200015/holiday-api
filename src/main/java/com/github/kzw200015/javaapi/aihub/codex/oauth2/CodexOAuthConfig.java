package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Codex OAuth2 模块配置。
 */
@Configuration
public class CodexOAuthConfig {

    @Bean
    public CodexOAuthPendingStore codexOAuthPendingStore() {
        return new CodexOAuthPendingStore();
    }
}
