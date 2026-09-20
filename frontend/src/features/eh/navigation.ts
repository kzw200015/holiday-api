import type { LocationQuery, RouteLocationNormalizedLoaded, RouteLocationRaw } from "vue-router"

export interface GalleryIdentity {
  gid: number
  token: string
}

export type GallerySource = "search" | "history"

export function gallerySource(query: LocationQuery): GallerySource {
  return query.source === "history" ? "history" : "search"
}

export function galleryListLocation(source: GallerySource): RouteLocationRaw {
  return { name: source === "history" ? "gallery-history" : "gallery-list" }
}

/* 来源列表由 source 一个参数一路带下去：阅读退出回详情页，详情页再按它回到原来的列表。 */
export function galleryDetailLocation(gallery: GalleryIdentity, source: GallerySource): RouteLocationRaw {
  return {
    name: "gallery-detail",
    params: { gid: gallery.gid, token: gallery.token },
    query: source === "history" ? { source: "history" } : {},
  }
}

export function readerLocation(gallery: GalleryIdentity, page: number, source: GallerySource): RouteLocationRaw {
  return {
    name: "reader",
    params: { gid: gallery.gid, token: gallery.token, page },
    query: source === "history" ? { source: "history" } : {},
  }
}

/**
 * 阅读器页面实例的 key：一本图集一个实例。
 *
 * 只有手改地址才会在原地换图集，整个重建比让每处状态各自复位简单。其它路由不设 key。
 */
export function readerInstanceKey(route: RouteLocationNormalizedLoaded) {
  return route.name === "reader" ? `${String(route.params.gid)}/${String(route.params.token)}` : undefined
}
