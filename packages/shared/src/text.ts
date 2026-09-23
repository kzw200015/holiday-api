/*
 * 长度口径。JS 字符串的 length 数的是 UTF-16 码元，哪条规则都不是按它定的：
 * 密码长度按人眼里的字符（码点）数，3 个汉字不该算够 8 位；搜索词按 UTF-8 字节数，因为它原样拼进 e 站的查询串。
 */

/** 码点个数。落单的代理项各算一个。 */
export function codePointLength(text: string): number {
  let count = 0
  for (const _ of text) {
    count += 1
  }
  return count
}

/** 按 UTF-8 编码后的字节数。落单的代理项按替换字符 U+FFFD 算 3 字节，与 TextEncoder 一致。 */
export function utf8Length(text: string): number {
  let bytes = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code < 0x10000) {
      bytes += 3
    } else {
      bytes += 4
    }
  }
  return bytes
}
