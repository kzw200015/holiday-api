package com.github.kzw200015.javaapi.aihub.codex.oauth2;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * PKCE 工具。
 */
public final class PkceUtil {

    private static final char[] VERIFIER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~".toCharArray();

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private PkceUtil() {
    }

    public record PkceCodes(String verifier, String challenge) {
    }

    public static PkceCodes generatePkce() {
        final String verifier = randomVerifier(43);
        final String challenge = s256Challenge(verifier);
        return new PkceCodes(verifier, challenge);
    }

    public static String generateState() {
        final byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String randomVerifier(int length) {
        final StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(VERIFIER_CHARS[SECURE_RANDOM.nextInt(VERIFIER_CHARS.length)]);
        }
        return sb.toString();
    }

    private static String s256Challenge(String verifier) {
        try {
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            final byte[] hash = digest.digest(verifier.getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (Exception ex) {
            throw new IllegalStateException("生成 PKCE challenge 失败", ex);
        }
    }
}
