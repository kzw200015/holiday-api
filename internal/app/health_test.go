package app

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReadinessFailsWhenTheDatabaseIsGoneWhileLivenessStaysUp(t *testing.T) {
	name := newDatabase(t)
	cfg := baseConfig
	cfg.DatabaseURL = databaseURL(name)
	a := mustStart(t, cfg)
	probes := func() [2]int {
		return [2]int{a.get(t, "/api/health/live").status, a.get(t, "/api/health/ready").status}
	}
	require.Equal(t, [2]int{http.StatusOK, http.StatusOK}, probes())

	// 强制断开所有连接并删掉应用的库，之后再连都会失败
	exec(t, admin, "DROP DATABASE "+name+" WITH (FORCE)")

	require.Equal(t, [2]int{http.StatusOK, http.StatusServiceUnavailable}, probes())
	require.Equal(t, "DATABASE_UNAVAILABLE", a.get(t, "/api/health/ready").json(t)["code"])
}
