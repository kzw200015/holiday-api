/** 触底加载的一页。nextCursor 为 null 表示已经是最后一页 */
export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null
}
