/** 测试接下来要用的值：没有就当场失败并说清缺了什么，而不是在后面某一步报出看不懂的错。 */
export function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`测试依赖的${what}不存在`)
  }
  return value
}
