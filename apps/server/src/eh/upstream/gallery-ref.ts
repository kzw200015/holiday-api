/** 图集定位信息：e 站用 gid 加 10 位十六进制的 token 认一本图集。 */
export interface GalleryRef {
  gid: number
  token: string
}

/** 按图集查表、做缓存键时用的写法。 */
export const refKey = (ref: GalleryRef) => `${ref.gid}:${ref.token}`
