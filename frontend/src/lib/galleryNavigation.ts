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

export function readerLocation(gallery: GalleryIdentity, page: number, origin: ReaderOrigin): RouteLocationRaw {
  const source = origin.kind === "history" ? "history" : origin.source
  return {
    name: "reader",
    params: { gid: gallery.gid, token: gallery.token, page },
    query: {
      source: source === "history" ? "history" : undefined,
      returnTo: origin.kind === "history" ? "history" : undefined,
    },
  }
}

export function readerExitLocation(gallery: GalleryIdentity, origin: ReaderOrigin): RouteLocationRaw {
  if (origin.kind === "history") {
    return galleryListLocation("history")
  }
  return galleryDetailLocation(gallery, origin.source)
}
