package com.github.kzw200015.myapi.codex.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.github.kzw200015.myapi.codex.exception.NoAvailableAccountException;
import com.github.kzw200015.myapi.codex.model.entity.CodexAccountEntity;
import com.github.kzw200015.myapi.codex.model.mapper.CodexAccountMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

@Service
@RequiredArgsConstructor
public class CodexAccountSelectionService {
    private final CodexAccountMapper codexAccountMapper;
    private final StickySessionService stickySessionService;
    private final AtomicLong roundRobinCounter = new AtomicLong();

    public CodexAccountEntity selectAvailableAccount(String stickyKey) {
        List<CodexAccountEntity> accounts = listAvailableAccounts();
        if (accounts.isEmpty()) {
            throw new NoAvailableAccountException();
        }

        if (StringUtils.hasText(stickyKey)) {
            Optional<CodexAccountEntity> stickyBoundAccount = selectStickyBoundAccount(stickyKey, accounts);
            if (stickyBoundAccount.isPresent()) {
                return stickyBoundAccount.get();
            }
        }

        CodexAccountEntity selected = selectByRoundRobin(accounts);
        if (StringUtils.hasText(stickyKey)) {
            stickySessionService.setBinding(stickyKey, selected.getAccountId());
        }
        return selected;
    }

    private List<CodexAccountEntity> listAvailableAccounts() {
        return codexAccountMapper.selectList(
                Wrappers.<CodexAccountEntity>lambdaQuery()
                        .eq(CodexAccountEntity::isEnabled, true)
                        .gt(CodexAccountEntity::getExpiresAt, OffsetDateTime.now())
                        .orderByAsc(CodexAccountEntity::getCreatedAt)
        );
    }

    private Optional<CodexAccountEntity> selectStickyBoundAccount(String stickyKey, List<CodexAccountEntity> accounts) {
        Optional<String> bindingAccountId = stickySessionService.findBindingAccountId(stickyKey);
        if (bindingAccountId.isEmpty()) {
            return Optional.empty();
        }

        String accountId = bindingAccountId.get();
        for (CodexAccountEntity account : accounts) {
            if (account.getAccountId().equals(accountId)) {
                return Optional.of(account);
            }
        }

        stickySessionService.deleteBinding(stickyKey);
        return Optional.empty();
    }

    private CodexAccountEntity selectByRoundRobin(List<CodexAccountEntity> accounts) {
        long counter = roundRobinCounter.getAndIncrement();
        int index = Math.floorMod(counter, accounts.size());
        return accounts.get(index);
    }
}
