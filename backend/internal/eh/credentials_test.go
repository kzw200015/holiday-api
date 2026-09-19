package eh

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"myapi/internal/eh/store"
	"myapi/internal/keylock"
)

var (
	oldCredential = Cookie{IpbMemberID: "100", IpbPassHash: "old-hash"}
	newCredential = Cookie{IpbMemberID: "200", IpbPassHash: "new-hash"}
)

func TestCredentialMutationDuringCacheFill(t *testing.T) {
	for _, each := range []struct {
		name    string
		initial Cookie
		next    Cookie
	}{
		{"解绑", oldCredential, Cookie{}},
		{"换绑", oldCredential, newCredential},
		{"首次绑定", Cookie{}, newCredential},
	} {
		t.Run(each.name, func(t *testing.T) {
			credentials, database := newCredentialTestStore(each.initial)
			// LRU 的清理循环留在虚拟时间环境外，测试只等待本次凭据操作。
			synctest.Test(t, func(t *testing.T) {
				started, resume := database.pauseRead()
				readDone := make(chan error, 1)
				go func() {
					_, err := credentials.Status(context.Background(), 1)
					readDone <- err
				}()
				<-started

				mutationDone := make(chan error, 1)
				go func() {
					mutationDone <- changeCredential(context.Background(), credentials, each.next)
				}()
				// 让修改操作运行到完成或阻塞，再放行已经读到旧快照的请求。
				synctest.Wait()
				close(resume)
				if err := <-readDone; err != nil {
					t.Fatal(err)
				}
				if err := <-mutationDone; err != nil {
					t.Fatal(err)
				}

				assertRequestCredential(t, credentials, 1, each.next)
			})
		})
	}
}

func TestCredentialUsersDoNotBlockEachOther(t *testing.T) {
	credentials, database := newCredentialTestStore(oldCredential)
	synctest.Test(t, func(t *testing.T) {
		started, resume := database.pauseRead()
		readDone := make(chan error, 1)
		go func() {
			_, err := credentials.Status(context.Background(), 1)
			readDone <- err
		}()
		<-started

		otherDone := make(chan error, 1)
		go func() {
			_, err := credentials.Status(context.Background(), 2)
			otherDone <- err
		}()
		synctest.Wait()
		select {
		case err := <-otherDone:
			if err != nil {
				t.Error(err)
			}
		default:
			t.Error("其他用户被正在读取凭据的用户阻塞")
		}
		close(resume)
		if err := <-readDone; err != nil {
			t.Fatal(err)
		}
	})
}

func TestCredentialWaitCanBeCanceled(t *testing.T) {
	for _, operation := range []struct {
		name string
		run  func(context.Context, *CredentialStore) error
	}{
		{"读取", func(ctx context.Context, s *CredentialStore) error {
			_, err := s.Status(ctx, 1)
			return err
		}},
		{"绑定", func(ctx context.Context, s *CredentialStore) error {
			_, err := s.Bind(ctx, 1, newCredential)
			return err
		}},
		{"解绑", func(ctx context.Context, s *CredentialStore) error {
			_, err := s.Unbind(ctx, 1)
			return err
		}},
	} {
		t.Run(operation.name, func(t *testing.T) {
			credentials, database := newCredentialTestStore(oldCredential)
			synctest.Test(t, func(t *testing.T) {
				started, resume := database.pauseRead()
				readDone := make(chan error, 1)
				go func() {
					_, err := credentials.Status(context.Background(), 1)
					readDone <- err
				}()
				<-started

				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				canceledDone := make(chan error, 1)
				go func() { canceledDone <- operation.run(ctx, credentials) }()
				synctest.Wait()
				cancel()
				synctest.Wait()
				select {
				case err := <-canceledDone:
					if !errors.Is(err, context.Canceled) {
						t.Errorf("取消返回 %v，期望 context.Canceled", err)
					}
				default:
					t.Error("取消后仍在等待其他请求完成")
				}

				close(resume)
				if err := <-readDone; err != nil {
					t.Fatal(err)
				}
				assertRequestCredential(t, credentials, 1, oldCredential)
				if status, err := credentials.Unbind(context.Background(), 1); err != nil || status.Bound {
					t.Fatalf("解绑 = %+v, err = %v", status, err)
				}
				assertRequestCredential(t, credentials, 1, Cookie{})
			})
		})
	}
}

func TestCredentialMutationFailurePreservesCredential(t *testing.T) {
	for _, next := range []Cookie{Cookie{}, newCredential} {
		t.Run(fmt.Sprintf("绑定目标=%s", next.IpbMemberID), func(t *testing.T) {
			credentials, database := newCredentialTestStore(oldCredential)
			assertRequestCredential(t, credentials, 1, oldCredential)
			database.writeErr = errors.New("数据库写入失败")
			if err := changeCredential(context.Background(), credentials, next); !errors.Is(err, database.writeErr) {
				t.Fatalf("修改失败 = %v，期望保留数据库错误", err)
			}
			assertRequestCredential(t, credentials, 1, oldCredential)
			database.writeErr = nil
			if err := changeCredential(context.Background(), credentials, next); err != nil {
				t.Fatal(err)
			}
			assertRequestCredential(t, credentials, 1, next)
		})
	}
}

func changeCredential(ctx context.Context, credentials *CredentialStore, next Cookie) error {
	if next.IpbMemberID == "" {
		_, err := credentials.Unbind(ctx, 1)
		return err
	}
	_, err := credentials.Bind(ctx, 1, next)
	return err
}

func assertRequestCredential(t *testing.T, credentials *CredentialStore, userID int64, want Cookie) {
	t.Helper()
	rc, err := credentials.RequestContext(context.Background(), userID, "")
	if err != nil {
		t.Fatal(err)
	}
	if want.IpbMemberID == "" {
		if rc.Credential != nil || rc.Site != SiteE {
			t.Fatalf("未绑定用户应匿名访问前站，得到 %+v", rc)
		}
		return
	}
	if rc.Credential == nil || *rc.Credential != want || rc.Site != SiteEx {
		t.Fatalf("请求身份 = %+v，期望使用 %s 的凭据访问里站", rc, want.IpbMemberID)
	}
}

func newCredentialTestStore(initial Cookie) (*CredentialStore, *credentialDB) {
	database := &credentialDB{cookies: map[int64]Cookie{1: initial}}
	client := NewClient("test", time.Second, roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader("ok"))}, nil
	}))
	return NewCredentialStore(store.New(database), client, keylock.New()), database
}

// 只替换 SQL 执行边界，保留真实 sqlc、凭据序列化、缓存和上游校验流程。
type credentialDB struct {
	mu          sync.Mutex
	cookies     map[int64]Cookie
	writeErr    error
	readStarted chan struct{}
	resumeRead  chan struct{}
}

func (d *credentialDB) pauseRead() (<-chan struct{}, chan struct{}) {
	d.readStarted = make(chan struct{})
	d.resumeRead = make(chan struct{})
	return d.readStarted, d.resumeRead
}

func (d *credentialDB) Exec(ctx context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	if err := ctx.Err(); err != nil {
		return pgconn.CommandTag{}, err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.writeErr != nil {
		return pgconn.CommandTag{}, d.writeErr
	}
	userID := args[0].(int64)
	switch {
	case strings.HasPrefix(query, "-- name: DeleteEhCredential"):
		delete(d.cookies, userID)
	case strings.HasPrefix(query, "-- name: UpsertEhCredential"):
		var cookie Cookie
		if err := json.Unmarshal([]byte(args[2].(string)), &cookie); err != nil {
			return pgconn.CommandTag{}, err
		}
		d.cookies[userID] = cookie
	default:
		return pgconn.CommandTag{}, fmt.Errorf("意外的 SQL: %s", query)
	}
	return pgconn.CommandTag{}, nil
}

func (d *credentialDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("凭据操作不应执行多行查询")
}

func (d *credentialDB) QueryRow(ctx context.Context, _ string, args ...any) pgx.Row {
	d.mu.Lock()
	cookie := d.cookies[args[0].(int64)]
	started, resume := d.readStarted, d.resumeRead
	d.readStarted, d.resumeRead = nil, nil
	d.mu.Unlock()

	return credentialRow(func(dest ...any) error {
		if started != nil {
			close(started)
			select {
			case <-resume:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		if cookie.IpbMemberID == "" {
			return pgx.ErrNoRows
		}
		serialized, _ := json.Marshal(cookie)
		*dest[0].(*string) = cookie.IpbMemberID
		*dest[1].(*string) = string(serialized)
		*dest[2].(*bool) = true
		return nil
	})
}

type credentialRow func(...any) error

func (r credentialRow) Scan(dest ...any) error { return r(dest...) }
