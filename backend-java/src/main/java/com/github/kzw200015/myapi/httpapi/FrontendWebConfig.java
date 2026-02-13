package com.github.kzw200015.myapi.httpapi;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * 前端静态资源托管 + 单页应用回退（优先返回静态文件，找不到则回退 index.html）。
 */
@Configuration
public class FrontendWebConfig implements WebMvcConfigurer {
    private static final String STATIC_LOCATION = "classpath:/static/";

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Resource index = new ClassPathResource("static/index.html");
        if (!index.exists()) {
            return;
        }

        registry.addResourceHandler("/**")
            .addResourceLocations(STATIC_LOCATION)
            .resourceChain(true)
            .addResolver(new SpaResourceResolver(index));
    }

    private static class SpaResourceResolver extends PathResourceResolver {
        private final Resource index;

        private SpaResourceResolver(Resource index) {
            this.index = index;
        }

        @Override
        protected Resource getResource(String resourcePath, Resource location) {
            Resource requested;
            try {
                requested = location.createRelative(resourcePath);
            } catch (IOException ex) {
                return index;
            }
            if (requested.exists() && requested.isReadable()) {
                return requested;
            }
            return index;
        }
    }
}
