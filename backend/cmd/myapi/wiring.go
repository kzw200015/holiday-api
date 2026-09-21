package main

import (
	"myapi/internal/auth"
	authstore "myapi/internal/auth/store"
	"myapi/internal/config"
	"myapi/internal/eh"
	"myapi/internal/signing"
)

// 这里是业务包和 config 之间的衔接，刻意留在装配层，不挪进各自的包：
//
//   - 业务包不认识 config。它们的构造器只收自己用得上的基本类型（测试里直接传字面量），
//     wire 又分不清两个 string、两个 time.Duration，挑字段喂过去的这一层就只能写在这里。
//   - 两把子密钥摆在一起派生，才看得出有没有谁直接拿了裸主密钥。
//     用途标签是密钥的一部分，改标签等于换密钥——已签发的令牌和已发出去的图片地址会一起失效。

func provideTokens(cfg config.Config) *auth.Tokens {
	return auth.NewTokens(signing.DeriveSecret(cfg.Security.SecretKey, "jwt-v1"), cfg.Security.TokenTTL)
}

func provideAttachmentSigner(cfg config.Config) *signing.AttachmentSigner {
	return signing.NewAttachmentSigner(
		signing.DeriveSecret(cfg.Security.SecretKey, "attachment-v1"), cfg.Security.AttachmentTTL)
}

func provideEhClient(cfg config.Config) *eh.Client {
	return eh.NewClient(cfg.EH.UserAgent, cfg.EH.RequestTimeout, nil)
}

func provideAuthService(queries *authstore.Queries, cfg config.Config) *auth.Service {
	return auth.NewService(queries, cfg.Security.AllowRegistration)
}
