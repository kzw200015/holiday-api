//go:build wireinject

package app

import (
	"context"

	"github.com/google/wire"

	"github.com/kzw200015/myapi/internal/config"
	"github.com/kzw200015/myapi/internal/database"
	"github.com/kzw200015/myapi/internal/holiday"
	"github.com/kzw200015/myapi/internal/outbound"
	"github.com/kzw200015/myapi/internal/web"
)

// initApp 构造服务的全部部件；返回的 cleanup 按构造的逆序释放资源。
//
// 改了这里或构造函数的参数后重新生成 wire_gen.go：go tool wire ./internal/app。
func initApp(ctx context.Context, cfg config.Config) (*app, func(), error) {
	wire.Build(
		database.NewPool,
		outbound.NewClient,
		holiday.NewStore,
		holiday.NewService,
		holiday.NewSource,
		holiday.NewRefresher,
		web.NewServer,
		wire.Struct(new(app), "*"),
	)
	return nil, nil, nil
}
