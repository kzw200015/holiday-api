import type { LocationQuery, RouteLocationRaw } from "vue-router"

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
