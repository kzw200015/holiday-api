package com.github.kzw200015.myapi.codex.util;

import tools.jackson.databind.JsonNode;

public final class JsonNodeReadUtils {
    private JsonNodeReadUtils() {
    }

    public static String readString(JsonNode node, String fieldName) {
        JsonNode field = node.get(fieldName);
        if (field == null || field.isNull()) {
            return null;
        }
        return field.asText();
    }

    public static Boolean readBoolean(JsonNode node, String fieldName) {
        JsonNode field = node.get(fieldName);
        if (field == null || field.isNull()) {
            return null;
        }
        return field.asBoolean();
    }

    public static Double readDouble(JsonNode node, String fieldName) {
        JsonNode field = node.get(fieldName);
        if (field == null || field.isNull()) {
            return null;
        }
        return field.asDouble();
    }

    public static Long readLong(JsonNode node, String fieldName) {
        JsonNode field = node.get(fieldName);
        if (field == null || field.isNull()) {
            return null;
        }
        return field.asLong();
    }
}
