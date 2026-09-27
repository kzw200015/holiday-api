/*
 * 长度口径。JS 字符串的 length 数的是 UTF-16 码元，搜索词的上限却是按 UTF-8 字节数定的：它原样拼进 e 站的查询串。
 */

/**
 * 按 UTF-8 编码后的字节数。落单的代理项按替换字符 U+FFFD 算 3 字节，与 TextEncoder 一致。
 * 不直接用 TextEncoder：共享包只开 ES 标准库的类型，保证这里的代码两端都能跑，TextEncoder 属于 Web API，不在其中。
 */
export function utf8Length(text: string): number {
  let bytes = 0
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code === undefined) {
      continue
    }
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
