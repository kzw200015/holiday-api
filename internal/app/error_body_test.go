package app

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// Echo 自己拒绝的请求也回 `{code, message}`，`code` 按状态码细分。

func TestUnknownPathsGetNotFound(t *testing.T) {
	r := shared.get(t, "/api/nope")
	require.Equal(t, http.StatusNotFound, r.status)
	body := r.json(t)
	require.Equal(t, "NOT_FOUND", body["code"])
	require.NotEmpty(t, body["message"])
}

func TestWrongMethodsGetMethodNotAllowedWithAllow(t *testing.T) {
	r := shared.send(t, http.MethodPost, "/api/holiday/detail")
	require.Equal(t, http.StatusMethodNotAllowed, r.status)
	require.Equal(t, "METHOD_NOT_ALLOWED", r.json(t)["code"])
	require.Contains(t, r.header.Get("Allow"), http.MethodGet)
}
