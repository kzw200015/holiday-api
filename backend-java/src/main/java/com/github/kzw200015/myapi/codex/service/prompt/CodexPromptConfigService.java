package com.github.kzw200015.myapi.codex.service.prompt;

import com.github.kzw200015.myapi.codex.dao.entity.CodexPromptConfigEntity;
import com.github.kzw200015.myapi.codex.dao.mapper.CodexPromptConfigMapper;
import com.github.kzw200015.myapi.codex.dto.prompt.CodexPromptConfig;
import com.github.kzw200015.myapi.codex.dto.prompt.CodexPromptSource;
import com.github.kzw200015.myapi.codex.dto.prompt.UpdatePromptConfigRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;

@Service
@RequiredArgsConstructor
public class CodexPromptConfigService {
    private static final int SINGLETON_CONFIG_ID = 1;

    private final CodexPromptConfigMapper codexPromptConfigMapper;

    /**
     * 获取当前生效的提示词配置。
     */
    public CodexPromptConfig getPromptConfig() {
        CodexPromptConfigEntity entity = requireConfigEntity();
        return CodexPromptConfig.from(entity);
    }

    /**
     * 更新提示词配置并返回最新值。
     */
    public CodexPromptConfig updatePromptConfig(UpdatePromptConfigRequest request) {
        CodexPromptSource source = CodexPromptSource.fromValue(request.source());
        if (source == CodexPromptSource.CUSTOM && request.customPrompt().isBlank()) {
            throw new IllegalArgumentException("source=custom 时 customPrompt 不能为空");
        }

        CodexPromptConfigEntity entity = requireConfigEntity();
        entity.setSource(source.value());
        entity.setCustomPrompt(request.customPrompt());
        entity.setForceOverride(request.forceOverride());
        entity.setUpdatedAt(OffsetDateTime.now());
        codexPromptConfigMapper.updateById(entity);
        return CodexPromptConfig.from(entity);
    }

    /**
     * 读取配置表中的单例记录，不存在则抛错。
     */
    private CodexPromptConfigEntity requireConfigEntity() {
        CodexPromptConfigEntity entity = codexPromptConfigMapper.selectById(SINGLETON_CONFIG_ID);
        if (entity == null) {
            throw new IllegalStateException("codex_prompt_config 缺少默认配置");
        }
        return entity;
    }
}
