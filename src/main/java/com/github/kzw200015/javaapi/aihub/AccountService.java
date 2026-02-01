package com.github.kzw200015.javaapi.aihub;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.CodexOAuthToken;
import com.github.kzw200015.javaapi.aihub.codex.oauth2.JwtClaimsUtil;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/**
 * Codex 账号存储服务。
 */
@Service
public class AccountService extends ServiceImpl<AccountMapper, AccountEntity> {

    private final JsonMapper jsonMapper;

    public AccountService(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    /**
     * 保存 OAuth2 token 接口返回的原始 JSON，并将类型固定为 oauth。
     */
    public void createOauthAccount(String name, CodexOAuthToken oauthJson) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name 不能为空");
        }
        if (oauthJson == null) {
            throw new IllegalArgumentException("oauthJson 不能为空");
        }

        final OffsetDateTime now = OffsetDateTime.now();
        final OffsetDateTime accessTokenExpiresAt = resolveAccessTokenExpiresAt(oauthJson, now);

        final AccountEntity entity = new AccountEntity();
        entity.setName(name.trim());
        entity.setAuthType(AccountAuthType.OAUTH.dbValue());
        entity.setOauthJson(oauthJson);
        entity.setAccessTokenExpiresAt(accessTokenExpiresAt);
        entity.setCreateTime(now);

        save(entity);
    }

    private OffsetDateTime resolveAccessTokenExpiresAt(CodexOAuthToken oauthJson, OffsetDateTime now) {
        final String accessToken = oauthJson.accessToken();
        final Long expEpochSeconds = JwtClaimsUtil.extractExpEpochSeconds(jsonMapper, accessToken);
        if (expEpochSeconds != null) {
            return OffsetDateTime.ofInstant(Instant.ofEpochSecond(expEpochSeconds), ZoneOffset.UTC);
        }

        final Long expiresIn = oauthJson.expiresIn();
        if (expiresIn != null && expiresIn > 0) {
            return now.plusSeconds(expiresIn);
        }
        return null;
    }

    public void updateOauthJsonAndExpiresAt(String id, CodexOAuthToken oauthJson) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("id 不能为空");
        }
        if (oauthJson == null) {
            throw new IllegalArgumentException("oauthJson 不能为空");
        }

        final OffsetDateTime now = OffsetDateTime.now();
        final OffsetDateTime accessTokenExpiresAt = resolveAccessTokenExpiresAt(oauthJson, now);

        final AccountEntity patch = new AccountEntity()
                .setId(id)
                .setOauthJson(oauthJson)
                .setAccessTokenExpiresAt(accessTokenExpiresAt);
        final boolean ok = updateById(patch);
        if (!ok) {
            throw new IllegalStateException("更新账号凭证失败：id=" + id);
        }
    }

}
