package com.github.kzw200015.myapi.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 提供 Jackson2 ObjectMapper（供 MyBatis-Plus JsonbTypeHandler 与业务解析使用）。
 */
@Configuration
public class Jackson2Config {
    @Bean
    public ObjectMapper jackson2ObjectMapper() {
        ObjectMapper objectMapper = new ObjectMapper();
        JacksonTypeHandler.setObjectMapper(objectMapper);
        return objectMapper;
    }
}
