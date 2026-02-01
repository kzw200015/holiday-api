package com.github.kzw200015.javaapi.aihub;

/**
 * 凭证类型。
 */
public enum AccountAuthType {

    /**
     * OAuth2 凭证（access_token/refresh_token）。
     */
    OAUTH("oauth");

    private final String dbValue;

    AccountAuthType(String dbValue) {
        this.dbValue = dbValue;
    }

    public String dbValue() {
        return dbValue;
    }
}
