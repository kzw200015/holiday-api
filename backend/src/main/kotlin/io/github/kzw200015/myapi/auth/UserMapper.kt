package io.github.kzw200015.myapi.auth

import org.apache.ibatis.annotations.Mapper

/** 本站账号在 users 表里的一行。passwordHash 绝不出现在响应体里，对外只经 AuthController 的 CurrentUserView。 */
data class User(val id: Long, val username: String, val passwordHash: String)

/** SQL 在同包路径下的 UserMapper.xml。 */
@Mapper
interface UserMapper {
    /** 用户名撞上唯一索引时抛 DuplicateKeyException。 */
    fun insert(username: String, passwordHash: String): User

    fun findByUsername(username: String): User?

    fun findById(id: Long): User?
}
