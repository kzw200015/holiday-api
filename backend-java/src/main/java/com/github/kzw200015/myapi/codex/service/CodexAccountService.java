package com.github.kzw200015.myapi.codex.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.kzw200015.myapi.codex.exception.AccountNotFoundException;
import com.github.kzw200015.myapi.codex.model.Account;
import com.github.kzw200015.myapi.codex.model.UpdateAccountRequest;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.model.mapper.CodexAccountMapper;
import com.github.kzw200015.myapi.common.model.PaginatedResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CodexAccountService {
    private final CodexAccountMapper codexAccountMapper;
    private final CodexQuotaService codexQuotaService;

    public PaginatedResult<Account> listAccountsPage(int page, int pageSize) {
        Page<CodexAccountEntity> pageResult = codexAccountMapper.selectPage(
                Page.of(page, pageSize),
                Wrappers.<CodexAccountEntity>lambdaQuery().orderByDesc(CodexAccountEntity::getCreatedAt)
        );
        List<Account> items = codexQuotaService.buildAccountsWithQuota(pageResult.getRecords());
        return new PaginatedResult<>(items, pageResult.getTotal(), page, pageSize);
    }

    public Account updateAccount(int id, UpdateAccountRequest req) {
        CodexAccountEntity entity = codexAccountMapper.selectOne(
                Wrappers.<CodexAccountEntity>lambdaQuery().eq(CodexAccountEntity::getId, id)
        );
        if (entity == null) {
            throw new AccountNotFoundException();
        }
        entity.setName(req.name());
        entity.setEnabled(req.enabled());
        entity.setUpdatedAt(OffsetDateTime.now());
        codexAccountMapper.updateById(entity);
        return Account.from(entity);
    }
}
