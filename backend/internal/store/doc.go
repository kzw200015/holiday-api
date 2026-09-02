// Package store 是数据访问层：schema.sql 是表结构的唯一真相，query.sql 是全部查询，
// 同目录下的 *.go 由 sqlc 从这两个文件生成（`sqlc generate`），生成的代码要入库、不要手改。
//
// 进程不碰 DDL：建表、改列、加索引都由人工上库执行 schema.sql 里的语句。
package store
