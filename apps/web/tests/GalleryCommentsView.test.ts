/* @vitest-environment happy-dom */
import { createPinia, disposePinia } from "pinia"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, h } from "vue"
import { createMemoryHistory, createRouter, RouterView } from "vue-router"

import type * as EhApi from "@/features/eh/api"
import { fetchGalleryComments, fetchGalleryDetail } from "@/features/eh/api"
import GalleryCommentsView from "@/features/eh/views/GalleryCommentsView.vue"
import { installQueries } from "@/shared/api/queries"
import { galleryCard, settle } from "./support"

vi.mock("@/features/eh/api", async (original) => ({
  ...(await original<typeof EhApi>()),
  fetchGalleryDetail: vi.fn(),
  fetchGalleryComments: vi.fn(),
}))

let pinia: ReturnType<typeof createPinia>
let app: ReturnType<typeof createApp> | undefined
let host: HTMLDivElement

function comment(id: number): EhApi.GalleryComment {
  return {
    id,
    author: `作者${id}`,
    postedAt: "",
    isUploader: false,
    score: "",
    segments: [{ type: "text", text: `评论${id}` }],
  }
}

async function mountComments(comments: EhApi.GalleryComment[], hiddenCount: number) {
  vi.mocked(fetchGalleryDetail).mockResolvedValue({ ...galleryCard(7), fileSize: 1, torrentCount: 0, expunged: false })
  vi.mocked(fetchGalleryComments).mockResolvedValue({ comments, hiddenCount })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/eh/g/:gid/:token/comments",
        component: GalleryCommentsView,
        props: (route) => ({ gid: Number(route.params.gid), token: String(route.params.token) }),
      },
    ],
  })
  await router.push("/eh/g/7/token7/comments")
  await router.isReady()
  host = document.createElement("div")
  document.body.append(host)
  app = createApp({ render: () => h(RouterView) })
  pinia = createPinia()
  app.use(router)
  app.use(pinia)
  installQueries(app)
  app.mount(host)
  await settle()
}

afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  disposePinia(pinia)
})

describe("评论页", () => {
  it("列出全部评论，标明是哪本图集，低分评论只说有几条没列出", async () => {
    await mountComments([1, 2, 3, 4, 5, 6, 7].map(comment), 33)
    expect(host.textContent).toContain("图集 7")
    for (const id of [1, 7]) {
      expect(host.textContent).toContain(`评论${id}`)
    }
    expect(host.textContent).toContain("另有 33 条低分评论未显示")
  })

  it("列出来的一条都没有、只有藏起来的，就不说「还没有评论」", async () => {
    await mountComments([], 2)
    expect(host.textContent).not.toContain("还没有评论")
    expect(host.textContent).toContain("另有 2 条低分评论未显示")
  })

  it("没有藏起来的评论就不提", async () => {
    await mountComments([comment(1)], 0)
    expect(host.textContent).not.toContain("低分评论")
  })
})
