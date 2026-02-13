package com.github.kzw200015.myapi.codex.service;

import com.github.kzw200015.myapi.codex.model.TokenResponse;

record TokenExchangeResult(String rawJson, TokenResponse parsed) {}
