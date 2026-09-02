package signing

import (
	"strconv"
	"testing"
	"time"
)

// 签名地址是图片接口唯一的鉴权手段——那两条接口不要求登录，签名过了就给图，
// 所以这里的每个用例都对应一种「本不该放行却放行了」的后果。
func TestAttachmentSigner(t *testing.T) {
	signer := NewAttachmentSigner("子密钥", time.Minute)

	t.Run("自己签的地址能通过校验", func(t *testing.T) {
		subject := "https://ehgt.org/x.webp"
		if !signer.Verify(subject, signer.Sign(subject)) {
			t.Error("自己签的地址没通过")
		}
	})

	t.Run("换一个 subject 就通不过", func(t *testing.T) {
		// 否则拿到自己那张图的签名就能改改地址去拉别的东西
		sig := signer.Sign("7:2231376:a7584a5932")
		for _, subject := range []string{"8:2231376:a7584a5932", "7:2231377:a7584a5932"} {
			if signer.Verify(subject, sig) {
				t.Errorf("%q 不该通过", subject)
			}
		}
	})

	t.Run("改过期时间就通不过", func(t *testing.T) {
		// 过期时间也在签名里，不然把 e 往后改一改就是一张永久通行证
		sig := signer.Sign("原文")
		expires, _ := strconv.ParseInt(sig.ExpiresAt, 10, 64)
		sig.ExpiresAt = strconv.FormatInt(expires+60_000, 10)
		if signer.Verify("原文", sig) {
			t.Error("改过期时间后仍然通过")
		}
	})

	t.Run("已经过期的地址不放行", func(t *testing.T) {
		expired := NewAttachmentSigner("子密钥", -time.Second)
		if expired.Verify("原文", expired.Sign("原文")) {
			t.Error("过期地址仍然通过")
		}
	})

	t.Run("换一把密钥签的地址不认", func(t *testing.T) {
		other := NewAttachmentSigner("别的密钥", time.Minute)
		if signer.Verify("原文", other.Sign("原文")) {
			t.Error("别的密钥签的地址通过了")
		}
	})

	t.Run("垃圾输入返回 false 而不是崩掉", func(t *testing.T) {
		future := strconv.FormatInt(time.Now().Add(time.Minute).UnixMilli(), 10)
		cases := []Signature{
			{},
			{ExpiresAt: "abc", Value: "deadbeef"},
			{ExpiresAt: future, Value: ""},
			{ExpiresAt: future, Value: "0"},
			{ExpiresAt: "NaN", Value: "0"},
			{ExpiresAt: "1e999", Value: "0"},
		}
		for _, sig := range cases {
			if signer.Verify("原文", sig) {
				t.Errorf("%+v 不该通过", sig)
			}
		}
	})
}

// 两个用途必须派生出不同的子密钥，否则任何一处的实现缺陷都会波及另一处。
func TestDeriveSecret(t *testing.T) {
	forToken := DeriveSecret("主密钥", "jwt-v1")

	if forToken == DeriveSecret("主密钥", "attachment-v1") {
		t.Error("不同用途派生出了同一把子密钥")
	}
	if forToken == DeriveSecret("另一把主密钥", "jwt-v1") {
		t.Error("不同主密钥派生出了同一把子密钥")
	}
	// 同样的输入必须稳定，否则重启后所有令牌和图片地址一起失效
	if forToken != DeriveSecret("主密钥", "jwt-v1") {
		t.Error("同样的输入派生结果不稳定")
	}
}
