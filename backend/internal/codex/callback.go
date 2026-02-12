package codex

import (
	"fmt"
	"net/url"
	"strings"
)

// OAuthCallback 是从浏览器回调 URL 解析出的参数。
type OAuthCallback struct {
	Code             string
	State            string
	Error            string
	ErrorDescription string
}

// ParseOAuthCallback 从回调 URL 中提取 code/state/error。
func ParseOAuthCallback(input string) (*OAuthCallback, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return nil, fmt.Errorf("回调地址不能为空")
	}

	candidate := trimmed
	if !strings.Contains(candidate, "://") {
		if strings.HasPrefix(candidate, "?") {
			candidate = "http://localhost" + candidate
		} else if strings.Contains(candidate, "=") {
			candidate = "http://localhost/?" + candidate
		} else {
			return nil, fmt.Errorf("回调地址格式错误")
		}
	}

	u, err := url.Parse(candidate)
	if err != nil {
		return nil, err
	}

	q := u.Query()
	code := strings.TrimSpace(q.Get("code"))
	state := strings.TrimSpace(q.Get("state"))
	errCode := strings.TrimSpace(q.Get("error"))
	errDesc := strings.TrimSpace(q.Get("error_description"))

	if u.Fragment != "" {
		if fragQ, errFrag := url.ParseQuery(u.Fragment); errFrag == nil {
			if code == "" {
				code = strings.TrimSpace(fragQ.Get("code"))
			}
			if state == "" {
				state = strings.TrimSpace(fragQ.Get("state"))
			}
			if errCode == "" {
				errCode = strings.TrimSpace(fragQ.Get("error"))
			}
			if errDesc == "" {
				errDesc = strings.TrimSpace(fragQ.Get("error_description"))
			}
		}
	}

	if errCode == "" && errDesc != "" {
		errCode = errDesc
		errDesc = ""
	}

	if code == "" && errCode == "" {
		return nil, fmt.Errorf("回调地址缺少 code")
	}

	return &OAuthCallback{
		Code:             code,
		State:            state,
		Error:            errCode,
		ErrorDescription: errDesc,
	}, nil
}
