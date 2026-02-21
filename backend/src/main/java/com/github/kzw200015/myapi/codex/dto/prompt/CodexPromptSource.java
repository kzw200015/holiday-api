package com.github.kzw200015.myapi.codex.dto.prompt;

/**
 * 系统提示词来源枚举。
 */
public enum CodexPromptSource {
    OPENCODE("opencode"),
    CUSTOM("custom");

    private final String value;

    CodexPromptSource(String value) {
        this.value = value;
    }

    /**
     * 返回数据库与接口使用的字符串值。
     */
    public String value() {
        return value;
    }

    /**
     * 将字符串来源解析为枚举。
     */
    public static CodexPromptSource fromValue(String source) {
        for (CodexPromptSource item : values()) {
            if (item.value.equals(source)) {
                return item;
            }
        }
        throw new IllegalArgumentException("source 必须为 opencode 或 custom");
    }
}
