package com.github.kzw200015.javaapi.aihub;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;

/**
 * Codex 账号存储服务。
 */
@Service
public class AccountService extends ServiceImpl<AccountMapper, AccountEntity> {

    /**
     * 保存 OAuth2 token 接口返回的原始 JSON，并将类型固定为 oauth。
     */
    public AccountEntity createOauthAccount(String name, Map<String, Object> oauthJson) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name 不能为空");
        }
        if (oauthJson == null || oauthJson.isEmpty()) {
            throw new IllegalArgumentException("oauthJson 不能为空");
        }

        final AccountEntity entity = new AccountEntity();
        entity.setName(name.trim());
        entity.setAuthType(AccountAuthType.OAUTH.dbValue());
        entity.setOauthJson(oauthJson);
        entity.setCreateTime(OffsetDateTime.now(ZoneOffset.UTC));

        save(entity);
        return entity;
    }
}
