package io.github.kzw200015.myapi.eh

import org.apache.ibatis.annotations.Mapper

/** eh_credentials 里的一行。cookie 列是 JSON 明文，等同于 e 站账号本身，存储约束见 schema.sql。 */
data class CredentialRow(val memberId: String, val cookie: String, val hasExAccess: Boolean)

/** SQL 在同包路径下的 CredentialMapper.xml。 */
@Mapper
interface CredentialMapper {
    fun find(userId: Long): CredentialRow?

    fun upsert(userId: Long, memberId: String, cookie: String, hasExAccess: Boolean)

    fun delete(userId: Long)
}
