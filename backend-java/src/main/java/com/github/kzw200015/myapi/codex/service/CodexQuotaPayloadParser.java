package com.github.kzw200015.myapi.codex.service;

import com.github.kzw200015.myapi.codex.model.CodexAccountQuota;
import com.github.kzw200015.myapi.codex.model.CodexQuotaAdditionalLimit;
import com.github.kzw200015.myapi.codex.model.CodexQuotaRateLimit;
import com.github.kzw200015.myapi.codex.model.CodexQuotaWindow;
import com.github.kzw200015.myapi.codex.util.JsonNodeReadUtils;
import tools.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

final class CodexQuotaPayloadParser {
    private CodexQuotaPayloadParser() {}

    static CodexAccountQuota parse(JsonNode payload) {
        return new CodexAccountQuota(
                JsonNodeReadUtils.readString(payload, "plan_type"),
                parseQuotaRateLimit(payload.get("rate_limit")),
                parseQuotaRateLimit(payload.get("code_review_rate_limit")),
                parseAdditionalRateLimits(payload.get("additional_rate_limits"))
        );
    }

    private static CodexQuotaRateLimit parseQuotaRateLimit(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new CodexQuotaRateLimit(
                JsonNodeReadUtils.readBoolean(node, "allowed"),
                JsonNodeReadUtils.readBoolean(node, "limit_reached"),
                parseQuotaWindow(node.get("primary_window")),
                parseQuotaWindow(node.get("secondary_window"))
        );
    }

    private static CodexQuotaWindow parseQuotaWindow(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new CodexQuotaWindow(
                JsonNodeReadUtils.readDouble(node, "used_percent"),
                JsonNodeReadUtils.readLong(node, "limit_window_seconds"),
                JsonNodeReadUtils.readLong(node, "reset_after_seconds"),
                JsonNodeReadUtils.readLong(node, "reset_at")
        );
    }

    private static List<CodexQuotaAdditionalLimit> parseAdditionalRateLimits(JsonNode node) {
        if (node == null || node.isNull() || !node.isArray()) {
            return List.of();
        }
        List<CodexQuotaAdditionalLimit> limits = new ArrayList<>();
        for (JsonNode item : node) {
            limits.add(new CodexQuotaAdditionalLimit(
                    JsonNodeReadUtils.readString(item, "limit_name"),
                    JsonNodeReadUtils.readString(item, "metered_feature"),
                    parseQuotaRateLimit(item.get("rate_limit"))
            ));
        }
        return limits;
    }
}
