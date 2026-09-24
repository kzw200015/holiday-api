/* @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest"
import { createApp, h } from "vue"

import CommentBody from "@/features/eh/components/CommentBody.vue"
import GalleryTag from "@/features/eh/components/GalleryTag.vue"
import EmptyState from "@/shared/components/EmptyState.vue"
import ErrorAlert from "@/shared/components/ErrorAlert.vue"
import { query } from "./support"

describe("页面公共反馈", () => {
  it("查询错误支持重试，保留自定义操作且按钮不会提交表单", () => {
    const retry = vi.fn()
    const host = document.createElement("div")
    const app = createApp({
      render: () =>
        h(ErrorAlert, { title: "加载失败", message: "网络异常", retryable: true, onRetry: retry }, () => "返回列表"),
    })
    app.mount(host)
    try {
      expect(host.textContent).toContain("网络异常")
      expect(host.textContent).toContain("返回列表")
      const button = query(host, "button")
      expect(button.type).toBe("button")
      button.click()
      expect(retry).toHaveBeenCalledTimes(1)
    } finally {
      app.unmount()
    }
  })

  it("未启用重试的操作错误不会显示重试按钮", () => {
    const host = document.createElement("div")
    const app = createApp({ render: () => h(ErrorAlert, { title: "操作失败", message: "请检查输入" }) })
    app.mount(host)
    try {
      expect(host.querySelector("button")).toBeNull()
    } finally {
      app.unmount()
    }
  })

  it.each([false, true])("空状态以状态语义显示文案（紧凑：%s）", (compact) => {
    const host = document.createElement("div")
    const app = createApp({ render: () => h(EmptyState, { message: "暂无内容", compact }) })
    app.mount(host)
    try {
      expect(host.querySelector('[role="status"]')?.textContent).toBe("暂无内容")
    } finally {
      app.unmount()
    }
  })

  it("评论片段保留换行和链接，文本不会被当作 HTML 执行", () => {
    const host = document.createElement("div")
    const app = createApp(CommentBody, {
      segments: [
        { type: "text", text: '<img src="x" onerror="alert(1)">' },
        { type: "break" },
        { type: "link", text: "原文", href: "https://example.com/comment" },
      ],
    })
    app.mount(host)
    try {
      expect(host.textContent).toContain('<img src="x" onerror="alert(1)">')
      expect(host.querySelector("img")).toBeNull()
      expect(host.querySelectorAll("br")).toHaveLength(1)
      const link = query(host, "a")
      expect(link.textContent).toBe("原文")
      expect(link.href).toBe("https://example.com/comment")
      expect(link.rel).toBe("noreferrer noopener")
      expect(link.target).toBe("_blank")
    } finally {
      app.unmount()
    }
  })

  it("图集标签使用统一徽章且不产生嵌套交互元素", () => {
    const host = document.createElement("div")
    const app = createApp({ render: () => h(GalleryTag, null, () => "language:chinese") })
    app.mount(host)
    try {
      expect(host.querySelector('[data-slot="badge"]')?.textContent).toBe("language:chinese")
      expect(host.querySelector("a, button")).toBeNull()
    } finally {
      app.unmount()
    }
  })
})
