//! 构建脚本：`sqlx::migrate!()` 在编译期把 `migrations/` 下的文件编进二进制，但编译器只盯着已有的文件，
//! 只新增一个迁移文件不会触发重新编译。让 Cargo 盯着整个目录，里面有任何增删改都重新编译。

fn main() {
    println!("cargo::rerun-if-changed=migrations");
}
