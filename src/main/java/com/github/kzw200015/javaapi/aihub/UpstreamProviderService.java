package com.github.kzw200015.javaapi.aihub;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;

/**
 * Codex 凭证存储服务。
 */
@Service
public class UpstreamProviderService extends ServiceImpl<UpstreamProviderMapper, UpstreamProviderEntity> {

    /**
     * 保存 OAuth2 token 接口返回的原始 JSON，并将类型固定为 oauth。
     */
    public void saveOauthJson(Map<String, Object> oauthJson) {
        if (oauthJson == null || oauthJson.isEmpty()) {
            throw new IllegalArgumentException("oauthJson 不能为空");
        }
        final UpstreamProviderEntity entity = new UpstreamProviderEntity();
        entity.setAuthType(UpstreamProviderAuthType.OAUTH.dbValue());
        entity.setOauthJson(oauthJson);
        entity.setCreateTime(OffsetDateTime.now(ZoneOffset.UTC));

        save(entity);
    }
}
