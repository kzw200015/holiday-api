// Package store 管数据库这一层的公共部分：连接池，以及作为跨模块表结构唯一真相的 schema.sql。
// 查询 SQL 与 sqlc 生成代码位于各业务模块的 store 子包，由根配置统一生成（`sqlc generate`）。
//
// 进程不碰 DDL：建表、改列、加索引都由人工上库执行 schema.sql 里的语句。
package store
