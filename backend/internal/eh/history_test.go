package eh

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"myapi/internal/auth"
	authstore "myapi/internal/auth/store"
	"myapi/internal/eh/store"
	"myapi/internal/signing"
)

func TestHistoryRoutesRequireAuth(t *testing.T) {
	handler := NewHandler(newValidationService(), auth.NewTokens("test", time.Hour)).Routes()
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/history"},
		{http.MethodPost, "/history/remove"},
		{http.MethodPost, "/history/clear"},
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(route.method, route.path, nil))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s: status = %d", route.path, response.Code)
		}
	}
}

func TestHistoryValidation(t *testing.T) {
	tokens := auth.NewTokens("test", time.Hour)
	token, err := tokens.Issue(1)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(newValidationService(), tokens).Routes()
	for _, value := range []string{"!", strings.Repeat("a", 257), base64.RawURLEncoding.EncodeToString([]byte(`{"gid":1}`)), base64.RawURLEncoding.EncodeToString([]byte(`{"gid":0,"readAt":"2026-01-01T00:00:00Z"}`))} {
		request := httptest.NewRequest(http.MethodGet, "/history?cursor="+value, nil)
		request.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("cursor %q: status = %d", value, response.Code)
		}
	}
	for _, body := range []string{`{}`, `{"gid":0}`, `{"gid":-1}`, `{"gid":1.5}`, `{"gid":1,"userId":2}`} {
		request := httptest.NewRequest(http.MethodPost, "/history/remove", strings.NewReader(body))
		request.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("body %s: status = %d", body, response.Code)
		}
	}
}

func TestReadingHistoryPostgres(t *testing.T) {
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
	users := authstore.New(tx)
	user, err := users.CreateUser(ctx, authstore.CreateUserParams{Username: fmt.Sprintf("history-%d", time.Now().UnixNano()), PasswordHash: "test"})
	if err != nil {
		t.Fatal(err)
	}
	other, err := users.CreateUser(ctx, authstore.CreateUserParams{Username: user.Username + "-other", PasswordHash: "test"})
	if err != nil {
		t.Fatal(err)
	}
	upstreamFailed := false
	client := NewClient("test", time.Second, roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := `{"error":"unavailable"}`
		if !upstreamFailed {
			var payload struct {
				GIDList [][2]json.RawMessage `json:"gidlist"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			entries := make([]string, 0, len(payload.GIDList))
			for i := len(payload.GIDList) - 1; i >= 0; i-- {
				gid := string(payload.GIDList[i][0])
				if gid == "27" {
					entries = append(entries, `{"gid":27,"error":"deleted"}`)
				} else {
					entries = append(entries, fmt.Sprintf(`{"gid":%s,"token":"aaaaaaaaaa","title":"图集 %s","thumb":"https://ehgt.org/test.jpg","filecount":"100"}`, gid, gid))
				}
			}
			body = `{"gmetadata":[` + strings.Join(entries, ",") + `]}`
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	}))
	queries := store.New(tx)
	service := NewService(queries, client, nil, nil, signing.NewAttachmentSigner("test", time.Hour))
	for gid := int64(1); gid <= 27; gid++ {
		if err := service.SaveProgress(ctx, user.ID, ReadingPosition{GID: gid, Token: "aaaaaaaaaa", Page: int32(gid)}); err != nil {
			t.Fatal(err)
		}
	}
	if err := service.SaveProgress(ctx, other.ID, ReadingPosition{GID: 27, Token: "aaaaaaaaaa", Page: 99}); err != nil {
		t.Fatal(err)
	}
	tokens := auth.NewTokens("test", time.Hour)
	token, err := tokens.Issue(user.ID)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(service, tokens).Routes()
	request := func(method, path, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if response.Code != http.StatusOK {
			t.Fatalf("%s: status = %d, body = %s", path, response.Code, response.Body)
		}
		return response
	}
	response := request(http.MethodGet, fmt.Sprintf("/history?userId=%d", other.ID), "")
	var envelope struct {
		Data ReadingHistoryPage `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	first := envelope.Data
	if len(first.Items) != 25 || first.NextCursor == nil || first.Items[0].GID != 27 || first.Items[24].GID != 3 {
		t.Fatalf("第一页及排序不正确：%+v", first)
	}
	if first.Items[0].Gallery != nil || first.Items[0].Page != 27 || first.Items[1].Gallery.Title != "图集 26" {
		t.Fatalf("失效记录、账号隔离或元数据顺序不正确：%+v", first.Items[:2])
	}
	second, err := service.ReadingHistory(ctx, user.ID, *first.NextCursor)
	if err != nil || len(second.Items) != 2 || second.Items[0].GID != 2 || second.Items[1].GID != 1 || second.NextCursor != nil {
		t.Fatalf("第二页 = %+v, err = %v", second, err)
	}
	// now() 在事务中不变，显式推进一条时间来验证最近阅读优先于 gid。
	if _, err := tx.Exec(ctx, "UPDATE eh_reading_progress SET updated_at = updated_at + interval '1 second' WHERE user_id = $1 AND gid = 1", user.ID); err != nil {
		t.Fatal(err)
	}
	latest, err := service.ReadingHistory(ctx, user.ID, "")
	if err != nil || latest.Items[0].GID != 1 {
		t.Fatalf("最近阅读未置顶：%+v, err = %v", latest, err)
	}
	request(http.MethodPost, "/history/remove", `{"gid":27}`)
	request(http.MethodPost, "/history/remove", `{"gid":27}`)
	if _, err := queries.GetReadingProgress(ctx, store.GetReadingProgressParams{UserID: user.ID, Gid: 27}); err != pgx.ErrNoRows {
		t.Fatalf("删除历史应同时删除进度，err = %v", err)
	}
	request(http.MethodPost, "/history/clear", "")
	empty, err := service.ReadingHistory(ctx, user.ID, "")
	if err != nil || empty.Items == nil || len(empty.Items) != 0 || empty.NextCursor != nil {
		t.Fatalf("清空后 = %+v, err = %v", empty, err)
	}
	page, err := queries.GetReadingProgress(ctx, store.GetReadingProgressParams{UserID: other.ID, Gid: 27})
	if err != nil || page != 99 {
		t.Fatalf("删除影响另一账号：page = %d, err = %v", page, err)
	}
	// 整批失败不降级成失效记录；前端可以明确重试。
	upstreamFailed = true
	if _, err := service.ReadingHistory(ctx, other.ID, ""); err == nil {
		t.Fatal("整批元数据请求失败应返回错误")
	}
}
