package eh

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strconv"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"github.com/jackc/pgx/v5"

	"myapi/internal/eh/store"
	"myapi/internal/keylock"
)

// 解析过的用户凭据。
type boundCredential struct {
	cookie      Cookie
	memberID    string
	hasExAccess bool
}

// CredentialStore 管理用户的 e 站凭据、缓存及请求站点选择。
// 凭据以 JSON 明文入库，存储约束见 internal/store/schema.sql。
type CredentialStore struct {
	queries *store.Queries
	client  *Client

	// 避免每张图片都查询凭据；绑定和解绑成功后失效。
	cache *expirable.LRU[int64, *boundCredential]

	// 同一用户的查库回填与凭据修改必须串行，防止失效后又写回旧凭据。
	locks *keylock.Locker
}

func NewCredentialStore(queries *store.Queries, client *Client, locks *keylock.Locker) *CredentialStore {
	return &CredentialStore{
		queries: queries,
		client:  client,
		cache:   expirable.NewLRU[int64, *boundCredential](1000, nil, 30*time.Minute),
		locks:   locks,
	}
}

// Status 返回绑定状态，不含明文 Cookie。
func (s *CredentialStore) Status(ctx context.Context, userID int64) (CredentialStatus, error) {
	bound, err := s.load(ctx, userID)
	if err != nil || bound == nil {
		return CredentialStatus{}, err
	}
	return CredentialStatus{Bound: true, MemberID: bound.memberID, HasExAccess: bound.hasExAccess}, nil
}

// Bind 验证凭据后入库。
// 字符集先自查一遍再发出去：这三个值会被原样拼进 Cookie 请求头，坏值不该有机会出门。
func (s *CredentialStore) Bind(ctx context.Context, userID int64, cookie Cookie) (CredentialStatus, error) {
	if err := cookie.validate(); err != nil {
		return CredentialStatus{}, err
	}

	hasExAccess, err := s.client.VerifyCredential(ctx, cookie)
	if err != nil {
		return CredentialStatus{}, err
	}

	// Cookie 只含字符串字段，JSON 编码不会失败。
	serialized, _ := json.Marshal(cookie)
	unlock, err := s.locks.Acquire(ctx, credentialLockKey(userID))
	if err != nil {
		return CredentialStatus{}, err
	}
	defer unlock()

	err = s.queries.UpsertEhCredential(ctx, store.UpsertEhCredentialParams{
		UserID:      userID,
		MemberID:    cookie.IpbMemberID,
		Cookie:      string(serialized),
		HasExAccess: hasExAccess,
	})
	if err != nil {
		return CredentialStatus{}, err
	}
	s.cache.Remove(userID)

	slog.Info("已绑定 e 站凭据", "userId", userID, "hasExAccess", hasExAccess)
	return CredentialStatus{Bound: true, MemberID: cookie.IpbMemberID, HasExAccess: hasExAccess}, nil
}

// Unbind 解绑并回一份解绑后的状态，跟 Bind 一样由服务端给出结果。
func (s *CredentialStore) Unbind(ctx context.Context, userID int64) (CredentialStatus, error) {
	unlock, err := s.locks.Acquire(ctx, credentialLockKey(userID))
	if err != nil {
		return CredentialStatus{}, err
	}
	defer unlock()

	if err := s.queries.DeleteEhCredential(ctx, userID); err != nil {
		return CredentialStatus{}, err
	}
	s.cache.Remove(userID)
	// 零值就是「没绑、没有里站权限」
	return CredentialStatus{}, nil
}

// RequestContext 组一次请求的上下文。
// 有里站权限就默认走里站（内容是前站的超集），调用方显式要前站时才降级。
func (s *CredentialStore) RequestContext(ctx context.Context, userID int64, requested Site) (RequestContext, error) {
	bound, err := s.load(ctx, userID)
	if err != nil {
		return RequestContext{}, err
	}

	if bound == nil {
		return RequestContext{Site: SiteE}, nil
	}
	site := SiteE
	if bound.hasExAccess && requested != SiteE {
		site = SiteEx
	}
	return RequestContext{Credential: &bound.cookie, Site: site}, nil
}

// 取一次凭据，命中缓存就不查库；未绑定时返回 nil。
// 查库失败不进缓存：那样一次数据库抖动会把这个用户钉死到 TTL 到期。
func (s *CredentialStore) load(ctx context.Context, userID int64) (*boundCredential, error) {
	if cached, ok := s.cache.Get(userID); ok {
		return cached, nil
	}
	unlock, err := s.locks.Acquire(ctx, credentialLockKey(userID))
	if err != nil {
		return nil, err
	}
	defer unlock()

	if cached, ok := s.cache.Get(userID); ok {
		return cached, nil
	}

	bound, err := s.read(ctx, userID)
	if err != nil {
		return nil, err
	}
	s.cache.Add(userID, bound)
	return bound, nil
}

// 业务前缀隔离共用锁组件的资源，三个凭据操作使用同一份 key 规则。
func credentialLockKey(userID int64) string {
	return "eh:credential:" + strconv.FormatInt(userID, 10)
}

func (s *CredentialStore) read(ctx context.Context, userID int64) (*boundCredential, error) {
	row, err := s.queries.GetEhCredential(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var cookie Cookie
	if err := json.Unmarshal([]byte(row.Cookie), &cookie); err != nil {
		return nil, err
	}
	return &boundCredential{cookie: cookie, memberID: row.MemberID, hasExAccess: row.HasExAccess}, nil
}
