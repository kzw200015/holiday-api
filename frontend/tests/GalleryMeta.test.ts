// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { createApp, h } from "vue"

import GalleryMeta from "@/components/gallery/GalleryMeta.vue"

describe("图集星级评分", () => {
  it.each([
    { rating: 0, widths: [0, 0, 0, 0, 0], label: "0.00" },
    { rating: 3.5, widths: [100, 100, 100, 50, 0], label: "3.50" },
    { rating: 4.68, widths: [100, 100, 100, 100, 68], label: "4.68" },
    { rating: 5, widths: [100, 100, 100, 100, 100], label: "5.00" },
    { rating: 9, widths: [100, 100, 100, 100, 100], label: "5.00" },
    { rating: -1, widths: [0, 0, 0, 0, 0], label: "0.00" },
  ])("评分 $rating 的星形填充与可访问文案一致", ({ rating, widths, label }) => {
    const host = document.createElement("div")
    const app = createApp({ render: () => h(GalleryMeta, { category: "Manga", rating }) })
    app.mount(host)
    try {
      const stars = host.querySelector('[role="img"]')!
      expect(stars.children).toHaveLength(5)
      expect(
        [...stars.querySelectorAll<HTMLElement>("span[style]")].map((star) => parseFloat(star.style.width)),
      ).toEqual(widths)
      expect(stars.getAttribute("aria-label")).toBe(`评分 ${label} / 5`)
      expect(stars.getAttribute("title")).toBe(`评分 ${label} / 5`)
      expect(stars.textContent).toBe("")
    } finally {
      app.unmount()
    }
  })
})
