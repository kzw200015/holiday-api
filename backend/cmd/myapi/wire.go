//go:build wireinject

// 依赖图的声明。改完跑 `wire ./cmd/myapi` 重新生成 wire_gen.go。
package main

import (
	"context"

	"github.com/google/wire"
	"github.com/jackc/pgx/v5/pgxpool"

	"myapi/internal/app"
	"myapi/internal/auth"
	authstore "myapi/internal/auth/store"
	"myapi/internal/config"
	"myapi/internal/eh"
	ehstore "myapi/internal/eh/store"
	"myapi/internal/holiday"
	holidaystore "myapi/internal/holiday/store"
	"myapi/internal/keylock"
)

// initApplication 从零装出整个应用：读配置、建日志器、建连接池、把各层 new 出来。
//
// 返回的 cleanup 串起了图里所有 provider 的清理动作（目前只有连接池），
// 中途哪一步失败，已经建好的部分也会被清掉。
func initApplication(ctx context.Context) (*application, func(), error) {
	wire.Build(
		// 配置和日志器都在图里：provideDatabase 收 *slog.Logger，
		// 「日志先就绪、再连库」这个顺序因此由依赖关系保证
		config.Load,
		// app.NewRouter 只要一个 StaticDir，就别把整个 config 递给它
		wire.FieldsOf(new(config.Config), "StaticDir"),
		provideLogger,
		provideDatabase,

		// 连接池同时充当 sqlc 的 DBTX；事务由需要它的服务自己 Begin，见 holiday.Service.RefreshYear
		wire.Bind(new(authstore.DBTX), new(*pgxpool.Pool)),
		wire.Bind(new(ehstore.DBTX), new(*pgxpool.Pool)),
		wire.Bind(new(holidaystore.DBTX), new(*pgxpool.Pool)),
		authstore.New,
		ehstore.New,
		holidaystore.New,

		provideTokens,
		provideAttachmentSigner,
		keylock.New,
		provideEhClient,
		provideAuthService,

		// 同一个 eh.Client 传给三处：出网只有这一个出口，要加限速也就只有一处可加
		eh.NewCredentialStore,
		eh.NewImageLocator,
		// 本站库里的那部分状态，Service 不再自己 new，也就不必再握着 *ehstore.Queries
		eh.NewUserState,
		eh.NewService,

		holiday.NewRemoteClient,
		holiday.NewService,

		auth.NewHandler,
		eh.NewHandler,
		holiday.NewHandler,
		app.NewRouter,
		wire.Struct(new(application), "*"),
	)
	return nil, nil, nil
}
