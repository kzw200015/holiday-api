package com.github.kzw200015.myapi.codex.controller;

import jakarta.validation.constraints.NotBlank;

public record CompleteOAuthRequest(
    @NotBlank String name,
    @NotBlank String redirectUrl
) {}
