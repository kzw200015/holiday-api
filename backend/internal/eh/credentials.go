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
	"golang.org/x/sync/singleflight"

	"myapi/internal/store"
)

// 解析过的用户凭据。
type boundCredential struct {
	cookie      Cookie
	memberID    string
	hasExAccess bool
}

// CredentialStore 管用户的 e 站凭据：入库、取出、以及据此决定一次请求走前站还是里站。
//
// 从 Service 里分出来是因为这件事有自己的一套关注点（缓存失效、站点降级），
// 跟搜索、取图那些编排逻辑没有交集；分开之后 Service 只需要「给我一个请求上下文」。
//
// 凭据以 JSON 明文入库，不加密——理由和代价见 internal/store/schema.sql 里 eh_credentials 的说明。
// 也因此读的时候没有任何「解析不出来就当未绑定」的兜底：那一列只由 Bind 写入，
// 真解析不出来说明有人手工改过库，让错误抛出去比静默显示成「未绑定」好查得多。
type CredentialStore struct {
	queries *store.Queries
	client  *Client

	// 已取出的凭据。图片代理是全系统请求最密集的接口，每张图都为它查一次库太浪费。
	// 绑定解绑时手动失效，TTL 和容量上限只是兜底，免得离开的用户一直占着位置。
	cache *expirable.LRU[int64, *boundCredential]
	// 阅读器一进页面就并发发出四五个请求，不合并的话同一个用户会被查库四五遍。
	loading singleflight.Group
}

func NewCredentialStore(queries *store.Queries, client *Client) *CredentialStore {
	return &CredentialStore{
		queries: queries,
		client:  client,
		cache:   expirable.NewLRU[int64, *boundCredential](1000, nil, 30*time.Minute),
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

// Bind 保存凭据。存之前先拿这组 Cookie 实际请求一次，无效就别入库，免得事后一脸茫然。
func (s *CredentialStore) Bind(ctx context.Context, userID int64, cookie Cookie) (CredentialStatus, error) {
	valid, hasExAccess := s.client.VerifyCredential(ctx, cookie)
	if !valid {
		return CredentialStatus{}, errCredentialRejected()
	}

	serialized, err := json.Marshal(cookie)
	if err != nil {
		return CredentialStatus{}, err
	}
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

func (s *CredentialStore) Unbind(ctx context.Context, userID int64) error {
	if err := s.queries.DeleteEhCredential(ctx, userID); err != nil {
		return err
	}
	s.cache.Remove(userID)
	return nil
}

// RequestContext 组一次请求的上下文。
// 有里站权限就默认走里站（内容是前站的超集），调用方显式要前站时才降级。
func (s *CredentialStore) RequestContext(ctx context.Context, userID int64, requested Site) (RequestContext, error) {
	bound, err := s.load(ctx, userID)
	if err != nil {
		return RequestContext{}, err
	}

	site := SiteE
	if bound != nil && bound.hasExAccess && requested != SiteE {
		site = SiteEx
	}
	if bound == nil {
		return RequestContext{Site: site}, nil
	}
	return RequestContext{Credential: &bound.cookie, Site: site}, nil
}

// 取一次凭据，命中缓存就不查库；未绑定时返回 nil。
// 查库失败不进缓存：那样一次数据库抖动会把这个用户钉死到 TTL 到期。
func (s *CredentialStore) load(ctx context.Context, userID int64) (*boundCredential, error) {
	if cached, ok := s.cache.Get(userID); ok {
		return cached, nil
	}

	loaded, err, _ := s.loading.Do(strconv.FormatInt(userID, 10), func() (any, error) {
		bound, err := s.read(ctx, userID)
		if err != nil {
			return nil, err
		}
		s.cache.Add(userID, bound)
		return bound, nil
	})
	if err != nil {
		return nil, err
	}
	return loaded.(*boundCredential), nil
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
