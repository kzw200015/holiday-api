package com.github.kzw200015.myapi.codex.service.prompt;

import com.github.kzw200015.myapi.codex.dto.prompt.CodexPromptConfig;
import com.github.kzw200015.myapi.codex.dto.prompt.CodexPromptSource;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@Service
@Slf4j
@RequiredArgsConstructor
public class CodexPromptInstructionService {
    private static final String CODEX_HEADER_INSTRUCTIONS_TEXT_URL =
            "https://raw.githubusercontent.com/anomalyco/opencode/refs/heads/dev/packages/opencode/src/session/prompt/codex_header.txt";

    private final CodexPromptConfigService codexPromptConfigService;
    private final RestClient restClient;
    private volatile String opencodeInstructions = "";

    /**
     * 启动时加载 opencode 系统提示词，失败直接中断启动。
     */
    @PostConstruct
    private void initializeOpencodeInstructions() {
        opencodeInstructions = fetchOpencodeInstructions();
    }

    /**
     * 每天刷新一次 opencode 系统提示词。
     */
    @Scheduled(cron = "0 0 4 * * *")
    public void refreshOpencodeInstructions() {
        opencodeInstructions = fetchOpencodeInstructions();
        log.info("已刷新 opencode 系统提示词");
    }

    /**
     * 根据系统配置决定是否覆盖请求中的 instructions。
     */
    public void applyPromptInstructions(ObjectNode requestBody) {
        CodexPromptConfig promptConfig = codexPromptConfigService.getPromptConfig();
        boolean hasInstructions = hasInstructions(requestBody);
        if (!promptConfig.forceOverride() && hasInstructions) {
            return;
        }

        String resolvedInstructions = resolveInstructions(promptConfig);
        requestBody.put("instructions", resolvedInstructions);
        removeDuplicateInstructionsInInputContent(requestBody);
    }

    /**
     * 按来源解析最终要注入的系统提示词。
     */
    private String resolveInstructions(CodexPromptConfig promptConfig) {
        CodexPromptSource source = CodexPromptSource.fromValue(promptConfig.source());
        if (source == CodexPromptSource.OPENCODE) {
            return opencodeInstructions;
        }
        return promptConfig.customPrompt();
    }

    /**
     * 判断请求是否已经携带非空 instructions。
     */
    private static boolean hasInstructions(ObjectNode requestBody) {
        JsonNode instructionsNode = requestBody.path("instructions");
        return !instructionsNode.isMissingNode() && !instructionsNode.asString().isBlank();
    }

    /**
     * 去掉 input[0].content 中与 opencodeInstructions 重复的前缀内容。
     */
    private void removeDuplicateInstructionsInInputContent(ObjectNode requestBody) {
        JsonNode firstInputNode = requestBody.path("input").path(0);
        if (firstInputNode.isMissingNode() || !(firstInputNode instanceof ObjectNode firstInputObjectNode)) {
            return;
        }

        JsonNode contentNode = firstInputObjectNode.path("content");
        if (!contentNode.isString()) {
            return;
        }
        String content = contentNode.asString();
        if (!content.startsWith(opencodeInstructions)) {
            return;
        }
        String contentWithoutInstructions = content.substring(opencodeInstructions.length());
        firstInputObjectNode.put("content", contentWithoutInstructions);
    }

    private String fetchOpencodeInstructions() {
        String instructions;
        try {
            instructions = restClient.get().uri(CODEX_HEADER_INSTRUCTIONS_TEXT_URL).retrieve().body(String.class);
        } catch (Exception ex) {
            throw new IllegalStateException("获取 opencode 系统提示词失败", ex);
        }
        if (instructions == null || instructions.isBlank()) {
            throw new IllegalStateException("获取 opencode 系统提示词失败: 内容为空");
        }
        return instructions;
    }
}
