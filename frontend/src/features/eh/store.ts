import { defineStore } from "pinia"
import { onScopeDispose, ref, shallowReactive, watch } from "vue"

import { useAuthStore } from "@/features/auth/store"
import {
  fetchCredentialStatus,
  fetchGalleryDetail,
  fetchGalleryPreferences,
  fetchSearchHistory,
  saveGalleryPreferences,
  saveProgress,
  saveSearchHistory,
} from "@/features/eh/api"
import type { GalleryDetailResult } from "@/features/eh/model"
import { createQueue, createRequest } from "@/shared/api/request"

/* 图集详情的新鲜期。要抓上游页面才拿得到，慢，而且短时间内不会变。 */
const DETAIL_STALE_TIME = 5 * 60 * 1000

/*
 * 换本站账号那一刻作废：不清掉就会把上一个账号的数据端给新账号。
 *
 * 必须同步执行。store 是在某个页面的 setup 里第一次创建的，普通 watcher 会排在那个页面之后才跑，
 * 而换账号时 AppLayout 先按新 key 重建页面：新页面看见旧数据还在就不读了，随后数据才被清空，只能一直停在骨架屏。
 * store 被销毁时同样作废，在途的读取和排队中的写入都不再落地。
 */
function onAccountChange(reset: () => void) {
  const auth = useAuthStore()
  watch(() => auth.pageRevision, reset, { flush: "sync" })
  onScopeDispose(reset)
}

/*
 * 本站账号的一份数据：读一次，之后以本地为准。
 *
 * 回头再读只会拿服务端的旧值盖掉用户刚改的，所以读到之后不再重取；多处同时要只读一次，读失败则下一处用到时再读。
 * 改动先落在本地，给了 persist 就排队整份提交，存不上既不回滚也不提示。
 * 代价是放弃跨设备同步：别处改了要刷新才看得见。
 */
function defineAccountData<T>(
  id: string,
  fetch: (signal: AbortSignal) => Promise<T>,
  persist?: (value: T) => Promise<unknown>,
) {
  return defineStore(id, () => {
    const request = createRequest<T>()
    const saves = createQueue()
    /* 旧账号还在排队的提交也不再发出，否则它会带着新账号的令牌出去。 */
    onAccountChange(() => {
      request.clear()
      saves.reset()
    })

    /** 没有、也不在读才去读。 */
    async function load() {
      if (request.data.value === undefined && !request.pending.value) {
        await request.run(fetch)
      }
    }

    function reload() {
      return request.run(fetch)
    }

    function set(next: T) {
      request.data.value = next
      if (persist) {
        saves.enqueue(() => persist(next))
      }
    }

    return { data: request.data, error: request.error, load, reload, set }
  })
}

/** 浏览偏好：常用分类与自动翻页间隔。 */
export const useGalleryPreferencesStore = defineAccountData(
  "GalleryPreferencesStore",
  fetchGalleryPreferences,
  saveGalleryPreferences,
)

/** 账号共享的搜索历史。 */
export const useSearchHistoryStore = defineAccountData("SearchHistoryStore", fetchSearchHistory, saveSearchHistory)

/** e 站账号的绑定状态。设置页和图库布局读的是同一份，绑定成功后图库那条匿名提示会当场消失。 */
export const useCredentialStore = defineAccountData("CredentialStore", fetchCredentialStatus)

interface DetailEntry {
  request: ReturnType<typeof createRequest<GalleryDetailResult>>
  fetchedAt: number
}

function fetchDetail(gid: number, token: string, entry: DetailEntry) {
  return entry.request.run(async (signal) => {
    const result = await fetchGalleryDetail(gid, token, signal)
    entry.fetchedAt = Date.now()
    return result
  })
}

function patchProgress(entry: DetailEntry | undefined, progress: number | null) {
  const data = entry?.request.data
  if (data?.value && data.value.progress !== progress) {
    data.value = { ...data.value, progress }
  }
}

/**
 * 受 e 站凭据影响、又要跨页面共用的内容：图集详情，连同阅读进度。
 *
 * 详情页和阅读器读的是同一份，从详情点进阅读不会再请求一次。进度本来就是详情接口返回的字段，
 * 翻页时改的、详情页「继续阅读第 N 页」读的都是这一份，不另存一处。
 *
 * 评论、搜索结果、阅读历史只活在各自的页面里，不放这里；换绑 e 站账号时它们看到 revision 变了，各自从头读。
 */
export const useGalleryContentStore = defineStore("GalleryContentStore", () => {
  /* 内容版本号：换绑 e 站账号后能看到的内容变了，它就加一。 */
  const revision = ref(0)
  /*
   * 按图集存的详情。不回收：一条只是一本图集的元数据，一次会话看不了多少本。
   * 留在闭包里不交给 pinia 当 state：state 的类型会把条目里的 ref 当成已经解包，可运行时它们仍是 ref。
   */
  const details = shallowReactive(new Map<string, DetailEntry>())
  /* 所有阅读器共用一条：同一本的两次上报一旦乱序，后到的旧页码会把进度按回去。 */
  const progressSaves = createQueue()

  function entryOf(gid: number, token: string) {
    const key = `${gid}/${token}`
    let entry = details.get(key)
    if (!entry) {
      entry = { request: createRequest<GalleryDetailResult>(), fetchedAt: 0 }
      details.set(key, entry)
    }
    return entry
  }

  /** 这本图集详情的读取状态；还没读过时为 undefined。 */
  function detail(gid: number, token: string) {
    return details.get(`${gid}/${token}`)?.request
  }

  /** 在途、或者新鲜期内读过，就不再请求。 */
  async function loadDetail(gid: number, token: string) {
    const entry = entryOf(gid, token)
    const fresh = entry.request.data.value !== undefined && Date.now() - entry.fetchedAt < DETAIL_STALE_TIME
    if (!entry.request.pending.value && !fresh) {
      await fetchDetail(gid, token, entry)
    }
  }

  function reloadDetail(gid: number, token: string) {
    return fetchDetail(gid, token, entryOf(gid, token))
  }

  /** 翻页当场改这本详情里的进度，详情页不必等网络就能显示新页码。 */
  function setProgress(gid: number, token: string, page: number) {
    patchProgress(details.get(`${gid}/${token}`), page)
  }

  /** 删掉阅读记录时一并抹掉进度，否则重进详情会显示一个服务端已经没有的页码。 */
  function forgetProgress(gid: number, token: string) {
    patchProgress(details.get(`${gid}/${token}`), null)
  }

  function forgetAllProgress() {
    for (const entry of details.values()) {
      patchProgress(entry, null)
    }
  }

  /** 往服务端存进度。排在一条队上依次发出，存不上不提示也不回退：下次翻页会再报一次。 */
  function persistProgress(gid: number, token: string, page: number) {
    progressSaves.enqueue(() => saveProgress(gid, token, page))
  }

  function dropDetails() {
    for (const entry of details.values()) {
      entry.request.abort()
    }
    details.clear()
  }

  /** 换绑 e 站账号后调用：详情全部作废，版本号加一，让只活在页面里的内容各自从头读。 */
  function reset() {
    dropDetails()
    revision.value += 1
  }

  /*
   * 换本站账号时只清空、不动版本号：KeepAlive 会按新 key 把页面全部重建，没有需要通知的旧页面。
   * 进度队列也一并作废，旧账号排着的上报不该记到新账号头上。
   */
  onAccountChange(() => {
    dropDetails()
    progressSaves.reset()
  })

  return {
    revision,
    detail,
    loadDetail,
    reloadDetail,
    setProgress,
    forgetProgress,
    forgetAllProgress,
    persistProgress,
    reset,
  }
})
