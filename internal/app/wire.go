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

// 改了这里或构造函数的参数后重新生成 wire_gen.go：go tool wire ./internal/app。

// parts 是配置之外的全部构造函数，生产与测试的 injector 共用。
var parts = wire.NewSet(
	database.NewPool,
	outbound.NewClient,
	holiday.NewStore,
	holiday.NewService,
	holiday.NewSource,
	holiday.NewRefresher,
	web.NewServer,
	wire.Struct(new(app), "*"),
)

// initApp 构造服务的全部部件，配置从环境变量读；返回的 cleanup 按构造的逆序释放资源。
func initApp(ctx context.Context) (*app, func(), error) {
	wire.Build(config.Load, parts)
	return nil, nil, nil
}

// initAppWith 和 [initApp] 一样，只是配置由调用方给：测试用它换掉库与数据源的地址。
func initAppWith(ctx context.Context, cfg config.Config) (*app, func(), error) {
	wire.Build(parts)
	return nil, nil, nil
}
