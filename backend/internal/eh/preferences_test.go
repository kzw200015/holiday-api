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
// 用零值的 userState 而不是 nil：真有哪条规则漏了，会当场 panic 而不是悄悄放行。
func newValidationService() *Service {
	return &Service{userState: newUserState(nil)}
}

func TestPreferenceRoutesRequireAuth(t *testing.T) {
	handler := NewHandler(newValidationService(), auth.NewTokens("test-secret", time.Hour)).Routes()
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/preferences"},
		{http.MethodPost, "/preferences/categories"},
		{http.MethodPost, "/preferences/reader-interval"},
		{http.MethodGet, "/search-history"},
		{http.MethodPost, "/search-history"},
		{http.MethodPost, "/search-history/remove"},
		{http.MethodPost, "/search-history/clear"},
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
		{"/preferences/categories", `{"categories":["unknown"]}`},
		{"/preferences/reader-interval", `{"interval":0}`},
		{"/preferences/reader-interval", `{"interval":21}`},
		{"/preferences/reader-interval", `{"interval":1.5}`},
		{"/search-history", `{"keyword":"   "}`},
		{"/search-history", `{"keyword":"` + strings.Repeat("a", 201) + `"}`},
	} {
		t.Run(each.body, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, each.path, strings.NewReader(each.body))
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
	service := &Service{userState: newUserState(queries)}
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
	assertPreferences(user.ID, []string{}, 5)
	history, err := service.SearchHistory(ctx, user.ID)
	if err != nil || history == nil || len(history) != 0 {
		t.Fatalf("initial history = %v, err = %v", history, err)
	}

	if err := service.SaveCategories(ctx, user.ID, []string{"manga", "doujinshi", "manga"}); err != nil {
		t.Fatal(err)
	}
	for _, interval := range []int32{1, 20, 8} {
		if err := service.SaveReaderInterval(ctx, user.ID, interval); err != nil {
			t.Fatal(err)
		}
		assertPreferences(user.ID, []string{"doujinshi", "manga"}, interval)
	}
	for index := range 12 {
		if _, err := service.RecordSearch(ctx, user.ID, fmt.Sprintf("词%d", index)); err != nil {
			t.Fatal(err)
		}
	}
	history, err = service.RecordSearch(ctx, user.ID, " 词5 ")
	want := []string{"词5", "词11", "词10", "词9", "词8", "词7", "词6", "词4", "词3", "词2"}
	if err != nil || !reflect.DeepEqual(history, want) {
		t.Fatalf("history = %v, err = %v", history, err)
	}
	assertPreferences(user.ID, []string{"doujinshi", "manga"}, 8)
	assertPreferences(other.ID, []string{}, 5)
	history, err = service.SearchHistory(ctx, other.ID)
	if err != nil || len(history) != 0 {
		t.Fatalf("other user's history = %v, err = %v", history, err)
	}
	if err := service.SaveCategories(ctx, user.ID, []string{}); err != nil {
		t.Fatal(err)
	}
	assertPreferences(user.ID, []string{}, 8)
	history, err = service.RemoveSearch(ctx, user.ID, "词5")
	if err != nil || !reflect.DeepEqual(history, want[1:]) {
		t.Fatalf("history after removal = %v, err = %v", history, err)
	}
	if cleared, err := service.ClearSearchHistory(ctx, user.ID); err != nil || len(cleared) != 0 {
		t.Fatalf("clear = %v, err = %v", cleared, err)
	}
	history, err = service.SearchHistory(ctx, user.ID)
	if err != nil || len(history) != 0 {
		t.Fatalf("history after clear = %v, err = %v", history, err)
	}
	assertPreferences(user.ID, []string{}, 8)

	// 身份只取登录令牌；请求中的 userId 不能读取或修改另一账号。
	tokens := auth.NewTokens("test-secret", time.Hour)
	token, err := tokens.Issue(other.ID)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(service, tokens).Routes()
	request := httptest.NewRequest(http.MethodPost, "/preferences/reader-interval", strings.NewReader(fmt.Sprintf(`{"interval":3,"userId":%d}`, user.ID)))
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	assertPreferences(user.ID, []string{}, 8)
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

	// 尚无偏好行时，删除和清空仍成功；首次保存任一字段都会补齐其余默认值。
	history, err = service.RemoveSearch(ctx, other.ID, "不存在")
	if err != nil || history == nil || len(history) != 0 {
		t.Fatalf("remove missing history = %v, err = %v", history, err)
	}
	if _, err := service.ClearSearchHistory(ctx, other.ID); err != nil {
		t.Fatal(err)
	}
	if err := service.SaveReaderInterval(ctx, other.ID, 3); err != nil {
		t.Fatal(err)
	}
	assertPreferences(other.ID, []string{}, 3)
	third, err := authstore.New(tx).CreateUser(ctx, authstore.CreateUserParams{Username: user.Username + "-third", PasswordHash: "test"})
	if err != nil {
		t.Fatal(err)
	}
	history, err = service.RecordSearch(ctx, third.ID, "首次搜索")
	if err != nil || !reflect.DeepEqual(history, []string{"首次搜索"}) {
		t.Fatalf("first search = %v, err = %v", history, err)
	}
	assertPreferences(third.ID, []string{}, 5)
}
