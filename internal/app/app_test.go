package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/kzw200015/myapi/internal/config"
	"github.com/kzw200015/myapi/internal/holiday"
)

// 集成测试经 HTTP 测整份应用：数据库是容器里的真 PostgreSQL，节假日数据源是本机的 [fakeSource]。
//
// 整个包共用一个容器与一份应用（shared），每个测试开始前调 [reset]。要自己摆库的测试（探针、启动）在同一个容器里
// 另建一个库，再起一份自己的应用。
var (
	// admin 连容器里的 postgres 库，建库删库用
	admin *pgxpool.Pool
	// postgresURL 是容器的连接串，库名由 [databaseURL] 换上
	postgresURL *url.URL
	// baseConfig 是 shared 的配置：经 config.Load 读出，库是 myapi，数据源是 fake。要自己的应用的测试复制一份再改
	baseConfig config.Config
	// shared 是共用的那份应用
	shared *runningApp
	// sharedDB 是 shared 的库
	sharedDB *pgxpool.Pool
	// fake 是 shared 用的假数据源
	fake *fakeSource
	// refresher 与 shared 用同一个库、同一个假数据源，测试直接调它刷新
	refresher *holiday.Refresher
)

func TestMain(m *testing.M) {
	os.Exit(testMain(m))
}

func testMain(m *testing.M) int {
	ctx := context.Background()
	container, err := tcpostgres.Run(ctx, "postgres:18-alpine", tcpostgres.WithDatabase("myapi"), tcpostgres.BasicWaitStrategies())
	if err != nil {
		log.Printf("起 PostgreSQL 容器失败: %v", err)
		return 1
	}
	defer func() {
		if err := testcontainers.TerminateContainer(container); err != nil {
			log.Printf("停 PostgreSQL 容器失败: %v", err)
		}
	}()

	postgresURL, err = url.Parse(container.MustConnectionString(ctx, "sslmode=disable"))
	if err != nil {
		log.Printf("解析连接串失败: %v", err)
		return 1
	}
	admin = mustConnect("postgres")
	defer admin.Close()
	fake = newFakeSource()
	defer fake.Close()

	mustSetenv("DATABASE_URL", databaseURL("myapi"))
	mustSetenv("HOLIDAY_SOURCE_URL", fake.URL)
	if baseConfig, err = config.Load(); err != nil {
		log.Printf("读配置失败: %v", err)
		return 1
	}
	// 测试直接调的刷新器经同一份组装建出，和 shared 里的一样
	parts, cleanup, err := initAppWith(ctx, baseConfig)
	if err != nil {
		log.Printf("组装失败: %v", err)
		return 1
	}
	defer cleanup()
	refresher = parts.refresher
	sharedDB = mustConnect("myapi")
	defer sharedDB.Close()

	shared, err = startApp(baseConfig)
	if err != nil {
		log.Printf("启动应用失败: %v", err)
		return 1
	}
	defer func() {
		if err := shared.stop(); err != nil {
			log.Printf("关停应用失败: %v", err)
		}
	}()
	return m.Run()
}

// reset 让共用的应用回到初始状态：恢复假数据源，清表，再把 2026 年的安排刷进库里，不随当前年份变。
func reset(t *testing.T) {
	t.Helper()
	fake.respond(holidayCN)
	exec(t, sharedDB, "DELETE FROM holiday_days")
	require.NoError(t, refresher.OneYear(t.Context(), 2026))
}

// runningApp 是跑起来的一份应用。
type runningApp struct {
	url  string
	stop func() error
}

// startApp 按 cfg 组装并跑一份应用，听一个空闲端口，等它开始监听；组装或启动失败时返回那个错误。
func startApp(cfg config.Config) (*runningApp, error) {
	cfg.Port = freePort()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		a, cleanup, err := initAppWith(ctx, cfg)
		if err != nil {
			done <- err
			return
		}
		defer cleanup()
		done <- a.run(ctx)
	}()
	a := &runningApp{url: fmt.Sprintf("http://127.0.0.1:%d", cfg.Port), stop: func() error { cancel(); return <-done }}

	for deadline := time.Now().Add(time.Minute); time.Now().Before(deadline); {
		select {
		case err := <-done:
			cancel()
			return nil, err
		case <-time.After(20 * time.Millisecond):
		}
		if response, err := http.Get(a.url + "/api/health/live"); err == nil {
			_ = response.Body.Close()
			return a, nil
		}
	}
	cancel()
	return nil, errors.New("应用一分钟内没有开始监听")
}

// mustStart 按 cfg 跑一份应用，测试结束时关停。
func mustStart(t *testing.T, cfg config.Config) *runningApp {
	t.Helper()
	a, err := startApp(cfg)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, a.stop()) })
	return a
}

// reply 是接口的一次响应。
type reply struct {
	status int
	body   string
	header http.Header
}

// json 把响应体解成 JSON 对象。
func (r reply) json(t *testing.T) map[string]any {
	t.Helper()
	var object map[string]any
	require.NoError(t, json.Unmarshal([]byte(r.body), &object), r.body)
	return object
}

func (a *runningApp) get(t *testing.T, path string) reply {
	return a.send(t, http.MethodGet, path)
}

func (a *runningApp) send(t *testing.T, method, path string) reply {
	t.Helper()
	request, err := http.NewRequestWithContext(t.Context(), method, a.url+path, nil)
	require.NoError(t, err)
	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)
	return reply{status: response.StatusCode, body: string(body), header: response.Header}
}

// fakeSource 是假的节假日数据源：本机的 HTTP 服务，按请求路径回放内存里的响应，默认回放 [holidayCN]。
// 请求照样走完真实的出网客户端（拼地址、认状态码、校验数据）。
type fakeSource struct {
	*httptest.Server
	responder atomic.Pointer[func(path string) (int, string)]
}

func newFakeSource() *fakeSource {
	f := &fakeSource{}
	f.respond(holidayCN)
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		status, body := (*f.responder.Load())(r.URL.Path)
		// 数据源把 .json 按 text/plain 返回
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	return f
}

// respond 换掉回放的响应。
func (f *fakeSource) respond(responder func(path string) (int, string)) {
	f.responder.Store(&responder)
}

// holidayCN 是 holiday-cn 数据源：只有 2026 年有数据，其余年份的文件还没建出来（404）。2026-01-04 是调休上班的周日。
func holidayCN(path string) (int, string) {
	if path != "/2026.json" {
		return http.StatusNotFound, "404: Not Found"
	}
	return http.StatusOK, `{"days": [
		{"name": "元旦", "date": "2026-01-01", "isOffDay": true},
		{"name": "元旦", "date": "2026-01-04", "isOffDay": false}
	]}`
}

// freePort 是一个此刻没人在听的端口：拿到后随即释放。
func freePort() int {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port
}

// unreachableURL 是连不上的地址：端口上没有人在听。
func unreachableURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d", freePort())
}

// databaseURL 是容器里名为 name 的库的连接串。
func databaseURL(name string) string {
	u := *postgresURL
	u.Path = "/" + name
	return u.String()
}

var databases atomic.Int64

// newDatabase 在容器里新建一个空库，测试结束时删掉，返回库名。
func newDatabase(t *testing.T) string {
	t.Helper()
	name := fmt.Sprintf("test_%d", databases.Add(1))
	exec(t, admin, "CREATE DATABASE "+name)
	t.Cleanup(func() {
		_, err := admin.Exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		require.NoError(t, err)
	})
	return name
}

// connect 连上容器里名为 name 的库，测试结束时断开。
func connect(t *testing.T, name string) *pgxpool.Pool {
	t.Helper()
	pool := mustConnect(name)
	t.Cleanup(pool.Close)
	return pool
}

func mustConnect(name string) *pgxpool.Pool {
	pool, err := pgxpool.New(context.Background(), databaseURL(name))
	if err != nil {
		panic(err)
	}
	return pool
}

func exec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	_, err := pool.Exec(t.Context(), sql, args...)
	require.NoError(t, err, sql)
}

func mustSetenv(key, value string) {
	if err := os.Setenv(key, value); err != nil {
		panic(err)
	}
}
