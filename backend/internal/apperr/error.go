// Package apperr 表达与传输协议无关的失败；HTTP 状态码由 web 统一决定。
package apperr

import "fmt"

type Kind string

const (
	InvalidArgument   Kind = "invalid_argument"
	Unauthenticated   Kind = "unauthenticated"
	PermissionDenied  Kind = "permission_denied"
	NotFound          Kind = "not_found"
	ResourceExhausted Kind = "resource_exhausted"
	UpstreamFailure   Kind = "upstream_failure"
)

// Error 的 Msg 可以展示给用户，Err 仅用于诊断，不能直接输出给用户。
type Error struct {
	Kind Kind
	Msg  string
	Err  error
}

func (e *Error) Error() string { return e.Msg }

func (e *Error) Unwrap() error { return e.Err }

func (e *Error) WithCause(err error) *Error {
	e.Err = err
	return e
}

func New(kind Kind, format string, args ...any) *Error {
	return &Error{Kind: kind, Msg: fmt.Sprintf(format, args...)}
}
