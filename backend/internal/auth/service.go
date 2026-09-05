// Package auth 是本站账号：注册、登录，以及无状态令牌的签发与校验。
package auth

import (
	"context"
	"errors"
	"log/slog"

	"github.com/alexedwards/argon2id"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"myapi/internal/apperr"
	"myapi/internal/store"
)

// 密码哈希参数，单次校验约 40 毫秒。
// 校验时参数是从哈希串里读的，所以改这里只影响新建的密码，已有的哈希照样验得过。
var hashParams = &argon2id.Params{
	Memory:      64 * 1024,
	Iterations:  2,
	Parallelism: 1,
	SaltLength:  16,
	KeyLength:   32,
}

// Service 是本站账号的业务逻辑，直接操作 users 表，没有单独的数据访问层。
type Service struct {
	queries           *store.Queries
	allowRegistration bool
}

func NewService(queries *store.Queries, allowRegistration bool) *Service {
	return &Service{queries: queries, allowRegistration: allowRegistration}
}

// Register 注册新账号，成功后直接返回可用于签发令牌的用户。
//
// 用户名判重交给 users_username_key 这个唯一索引，而不是先查再插：
// 先查再插在两个并发请求之间是有窗口的，而唯一索引本来就在那儿。
func (s *Service) Register(ctx context.Context, username, password string) (store.User, error) {
	if !s.allowRegistration {
		return store.User{}, apperr.New(apperr.InvalidArgument, "本站已关闭注册")
	}

	hash, err := argon2id.CreateHash(password, hashParams)
	if err != nil {
		return store.User{}, err
	}

	user, err := s.queries.CreateUser(ctx, store.CreateUserParams{Username: username, PasswordHash: hash})
	if isUniqueViolation(err) {
		return store.User{}, apperr.New(apperr.InvalidArgument, "用户名已被占用")
	}
	if err != nil {
		return store.User{}, err
	}

	slog.Info("已注册新用户", "userId", user.ID, "username", user.Username)
	return user, nil
}

// Login 校验账号密码。用户名大小写敏感，直接走 users_username_key。
func (s *Service) Login(ctx context.Context, username, password string) (store.User, error) {
	user, err := s.queries.GetUserByUsername(ctx, username)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return store.User{}, err
	}

	// 用户不存在时也要跑一次哈希校验：直接返回的话，响应快慢就把「哪些用户名存在」说出去了。
	// 文案同理，两种情况回同一句话
	match, hashErr := argon2id.ComparePasswordAndHash(password, orDummyHash(user.PasswordHash))
	if err != nil || hashErr != nil || !match {
		return store.User{}, apperr.New(apperr.InvalidArgument, "用户名或密码错误")
	}
	return user, nil
}

// FindByID 按 id 取用户，供鉴权后还原当前登录者。
// 找不到返回 nil 而不是错误：账号已被删就按未登录处理。
func (s *Service) FindByID(ctx context.Context, id int64) (*store.User, error) {
	user, err := s.queries.GetUserByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// 一个真实形状的 argon2id 串，用户不存在时拿它顶上，好让校验耗时与真实账号一致。
const dummyHash = "$argon2id$v=19$m=65536,t=2,p=1$V3RDOUgDvIfDcjYEAIfghw$" +
	"944XZMEceic4XWjgEwTPbYVHWIVkGO7WIRJgSrzMMgY"

func orDummyHash(hash string) string {
	if hash == "" {
		return dummyHash
	}
	return hash
}

// 唯一索引冲突。PostgreSQL 的 23505，靠它把「用户名已被占用」和真正的数据库故障分开。
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
