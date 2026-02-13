package com.github.kzw200015.myapi.codex.service;

import java.time.OffsetDateTime;

record StickyBinding(String accountId, OffsetDateTime expiresAt) {}
