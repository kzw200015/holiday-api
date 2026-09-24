import type { GalleryCard } from "@myapi/shared/eh"
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, vi } from "vitest"
import { createApp, nextTick, type App } from "vue"

import { useEhWrites } from "@/features/eh/queries"
import { installQueries } from "@/shared/api/queries"

/** 测试接下来要用的值：没有就当场失败并说清缺了什么，而不是在后面某一步报出看不懂的错。 */
export function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`测试依赖的${what}不存在`)
  }
  return value
}

/** 测试要操作的元素：找不到就当场失败并报出选择器。类型推断与 querySelector 一致。 */
export function query<K extends keyof HTMLElementTagNameMap>(root: ParentNode, selector: K): HTMLElementTagNameMap[K]
export function query<E extends Element = Element>(root: ParentNode, selector: string): E
export function query(root: ParentNode, selector: string): Element {
  return present(root.querySelector(selector), `元素 ${selector} `)
}

/** 按文字找元素（多是按钮）：selector 圈定范围，文字去掉两端空白后要完全一致；找不到就当场失败。 */
export function byText<E extends Element = HTMLElement>(root: ParentNode, selector: string, text: string): E {
  return present(
    [...root.querySelectorAll<E>(selector)].find((node) => node.textContent?.trim() === text),
    `文字为「${text}」的 ${selector} `,
  )
}

/** 一个由测试决定何时落地的 Promise：用来摆出「请求在途」「旧响应迟到」这类时序。 */
export function deferred<T>() {
  let resolve: ((value: T) => void) | undefined
  let reject: ((error: Error) => void) | undefined
  /* Promise 的构造函数同步调用执行器，两个回调在这之后就都有了 */
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve: present(resolve, "resolve 回调"), reject: present(reject, "reject 回调") }
}

/** 真时钟下等已经落地的 Promise 都跑完，再等一轮渲染。 */
export async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

/** 假时钟下的 settle：推进 0 毫秒让排好的回调跑完，再等一轮渲染。 */
export async function settleFakeTimers() {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

/** 列表里的一张卡片，除了 gid 与由它推出的令牌、标题，其余字段固定。 */
export function galleryCard(gid: number): GalleryCard {
  return {
    gid,
    token: `token${gid}`,
    title: `图集 ${gid}`,
    titleJpn: "",
    category: "Manga",
    thumbnail: "/thumbnail",
    uploader: "tester",
    postedAt: "2026-09-05T00:00:00Z",
    fileCount: 10,
    rating: 4,
    tags: [],
  }
}

/**
 * 只跑组合式函数的测试：每个用例一个新的 pinia，用例里 mount 的几个应用共用它（账号级的数据每个页面读到的都是同一份），
 * 和 main.ts 一样装上查询库。用例结束时先等排着队的写入落地（否则它们会在下一个用例里才发出），再卸载、销毁。
 * 在测试文件顶层调用一次。
 */
export function composableTests() {
  let pinia = createPinia()
  const apps = new Map<unknown, App>()
  beforeEach(() => {
    pinia = createPinia()
  })
  afterEach(async () => {
    await useEhWrites(pinia).account.settled()
    for (const app of apps.values()) {
      app.unmount()
    }
    apps.clear()
    disposePinia(pinia)
  })

  return {
    get pinia() {
      return pinia
    },
    /** 在一个新应用里调用组合式函数，交回它的返回值。 */
    mount<T>(setup: () => T): T {
      let result: T | undefined
      const app = createApp({
        setup() {
          result = setup()
          return () => null
        },
      })
      app.use(pinia)
      installQueries(app)
      app.mount(document.createElement("div"))
      const value = present(result, "组合式函数的返回值")
      apps.set(value, app)
      return value
    },
    /** 提前卸载 mount 出来的某个应用，用来模拟页面离开。 */
    unmount(result: unknown) {
      apps.get(result)?.unmount()
      apps.delete(result)
    },
  }
}
