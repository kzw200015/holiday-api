import type { LocationQuery, RouteLocationRaw } from "vue-router"

export interface GalleryIdentity {
  gid: number
  token: string
}

export type GallerySource = "search" | "history"
export type ReaderOrigin = { kind: "detail"; source: GallerySource } | { kind: "history" }

export function gallerySource(query: LocationQuery): GallerySource {
  return query.source === "history" ? "history" : "search"
}

export function readerOrigin(query: LocationQuery): ReaderOrigin {
  if (query.returnTo === "history") {
    return { kind: "history" }
  }
  return { kind: "detail", source: gallerySource(query) }
}

export function galleryListLocation(source: GallerySource): RouteLocationRaw {
  return { name: source === "history" ? "gallery-history" : "gallery-list" }
}

export function galleryDetailLocation(gallery: GalleryIdentity, source: GallerySource): RouteLocationRaw {
  return {
    name: "gallery-detail",
    params: { gid: gallery.gid, token: gallery.token },
    query: source === "history" ? { source: "history" } : {},
  }
}

/* 退出阅读的去处只由这两个 query 决定：returnTo 指回阅读历史，source 指回详情页的来源列表。
 * 直接从历史进入阅读时只需要 returnTo——退出就回历史列表，中间不经过详情页。 */
export function readerLocation(gallery: GalleryIdentity, page: number, origin: ReaderOrigin): RouteLocationRaw {
  return {
    name: "reader",
    params: { gid: gallery.gid, token: gallery.token, page },
    query:
      origin.kind === "history"
        ? { returnTo: "history" }
        : { source: origin.source === "history" ? "history" : undefined },
  }
}

export function readerExitLocation(gallery: GalleryIdentity, origin: ReaderOrigin): RouteLocationRaw {
  if (origin.kind === "history") {
    return galleryListLocation("history")
  }
  return galleryDetailLocation(gallery, origin.source)
}
