package eh

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"myapi/internal/auth"
	authstore "myapi/internal/auth/store"
	"myapi/internal/eh/store"
)

// 入参校验都在碰数据库之前完成，所以这些用例不需要真正的连接。
// 用零值的 UserState 而不是 nil：真有哪条规则漏了，会当场 panic 而不是悄悄放行。
func newValidationService() *Service {
	return &Service{UserState: NewUserState(nil)}
}

func TestPreferenceRoutesRequireAuth(t *testing.T) {
	handler := NewHandler(newValidationService(), auth.NewTokens("test-secret", time.Hour)).Routes()
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/preferences"},
		{http.MethodPut, "/preferences"},
		{http.MethodGet, "/search-history"},
		{http.MethodPut, "/search-history"},
	} {
		t.Run(route.path+route.method, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(route.method, route.path, nil))
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401", response.Code)
			}
		})
	}
}

func TestPreferenceValidation(t *testing.T) {
	tokens := auth.NewTokens("test-secret", time.Hour)
	token, err := tokens.Issue(1)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(newValidationService(), tokens).Routes()
	for _, each := range []struct{ path, body string }{
		{"/preferences", `{"categories":["unknown"],"readerInterval":5}`},
		{"/preferences", `{"categories":[],"readerInterval":0}`},
		{"/preferences", `{"categories":[],"readerInterval":21}`},
		{"/preferences", `{"categories":[],"readerInterval":1.5}`},
		/* 身份只认令牌，请求体里多带一个 userId 会被当作未知字段挡下。 */
		{"/preferences", `{"categories":[],"readerInterval":5,"userId":2}`},
		{"/search-history", `{"entries":["   "]}`},
		{"/search-history", `{"entries":["` + strings.Repeat("a", 201) + `"]}`},
		{"/search-history", `{"entries":["1","2","3","4","5","6","7","8","9","10","11"]}`},
	} {
		t.Run(each.path+each.body, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPut, each.path, strings.NewReader(each.body))
			request.Header.Set("Authorization", "Bearer "+token)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
			}
		})
	}
}

// 显式传入独立测试库；所有建表与数据修改都在回滚事务内，不读取应用配置。
func TestPreferencesPostgres(t *testing.T) {
	databaseURL := os.Getenv("MYAPI_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("设置 MYAPI_TEST_DATABASE_URL 后运行 PostgreSQL 集成测试")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	schema, err := os.ReadFile("../store/schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, string(schema)); err != nil {
		t.Fatal(err)
	}
	queries := store.New(tx)
	service := &Service{UserState: NewUserState(queries)}
	user, err := authstore.New(tx).CreateUser(ctx, authstore.CreateUserParams{Username: fmt.Sprintf("preferences-%d", time.Now().UnixNano()), PasswordHash: "test"})
	if err != nil {
		t.Fatal(err)
	}
	other, err := authstore.New(tx).CreateUser(ctx, authstore.CreateUserParams{Username: user.Username + "-other", PasswordHash: "test"})
	if err != nil {
		t.Fatal(err)
	}
	assertPreferences := func(userID int64, categories []string, interval int32) {
		t.Helper()
		got, err := service.Preferences(ctx, userID)
		if err != nil || !reflect.DeepEqual(got, Preferences{Categories: categories, ReaderInterval: interval}) {
			t.Fatalf("preferences = %+v, err = %v", got, err)
		}
	}
	assertHistory := func(userID int64, want []string) {
		t.Helper()
		got, err := service.SearchHistory(ctx, userID)
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("history = %v, want %v, err = %v", got, want, err)
		}
	}
	assertPreferences(user.ID, []string{}, 5)
	assertHistory(user.ID, []string{})

	// 偏好整份提交，两个字段一起落；分类排序去重后入库。
	if err := service.SavePreferences(ctx, user.ID, Preferences{Categories: []string{"manga", "doujinshi", "manga"}, ReaderInterval: 8}); err != nil {
		t.Fatal(err)
	}
	assertPreferences(user.ID, []string{"doujinshi", "manga"}, 8)

	// 搜索历史同样整份替换：顺序照前端给的存，同一份重复提交结果不变。
	entries := []string{"词5", "词4", "词3", "词2", "词1"}
	for range 2 {
		if err := service.SaveSearchHistory(ctx, user.ID, entries); err != nil {
			t.Fatal(err)
		}
		assertHistory(user.ID, entries)
	}

	// 关键词两端的空白入库前去掉。
	if err := service.SaveSearchHistory(ctx, user.ID, []string{" 词9 "}); err != nil {
		t.Fatal(err)
	}
	assertHistory(user.ID, []string{"词9"})

	// 超出条数上限整份退回，库里原来那份不受影响。用非空关键词，免得实际上是被「不能为空」挡下的。
	tooMany := make([]string, 0, searchHistoryLimit+1)
	for i := range searchHistoryLimit + 1 {
		tooMany = append(tooMany, fmt.Sprintf("词%d", i))
	}
	if err := service.SaveSearchHistory(ctx, user.ID, tooMany); err == nil {
		t.Fatal("超出条数上限应当报错")
	}
	assertHistory(user.ID, []string{"词9"})

	// 清空就是提交一份空列表，不再有单独的接口。
	if err := service.SaveSearchHistory(ctx, user.ID, []string{}); err != nil {
		t.Fatal(err)
	}
	assertHistory(user.ID, []string{})
	assertPreferences(user.ID, []string{"doujinshi", "manga"}, 8)

	// 写入只落在自己账号上。
	assertPreferences(other.ID, []string{}, 5)
	assertHistory(other.ID, []string{})

	// 身份只取登录令牌；请求中的 userId 不能读取或修改另一账号。
	tokens := auth.NewTokens("test-secret", time.Hour)
	token, err := tokens.Issue(other.ID)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(service, tokens).Routes()
	request := httptest.NewRequest(http.MethodPut, "/preferences", strings.NewReader(fmt.Sprintf(`{"categories":[],"readerInterval":3,"userId":%d}`, user.ID)))
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	assertPreferences(user.ID, []string{"doujinshi", "manga"}, 8)
	request = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/preferences?userId=%d", user.ID), nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	var body struct {
		Data Preferences `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || !reflect.DeepEqual(body.Data, Preferences{Categories: []string{}, ReaderInterval: 5}) {
		t.Fatalf("read another user's preferences: %s", response.Body.String())
	}

	// 尚无偏好行时，先写哪一边都会把其余的列补上默认值。
	if err := service.SaveSearchHistory(ctx, other.ID, []string{"首次搜索"}); err != nil {
		t.Fatal(err)
	}
	assertHistory(other.ID, []string{"首次搜索"})
	assertPreferences(other.ID, []string{}, 5)
	third, err := authstore.New(tx).CreateUser(ctx, authstore.CreateUserParams{Username: user.Username + "-third", PasswordHash: "test"})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.SavePreferences(ctx, third.ID, Preferences{Categories: []string{}, ReaderInterval: 3}); err != nil {
		t.Fatal(err)
	}
	assertPreferences(third.ID, []string{}, 3)
	assertHistory(third.ID, []string{})
}
