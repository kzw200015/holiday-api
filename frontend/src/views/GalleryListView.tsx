import { SearchIcon, XIcon } from "@lucide/vue"
import { useInfiniteScroll } from "@vueuse/core"
import { defineComponent, onActivated, onDeactivated, reactive, ref } from "vue"
import { RouterLink } from "vue-router"

import { type GalleryCard } from "@/api/eh"
import ConfirmDialog from "@/components/ConfirmDialog"
import ErrorAlert from "@/components/ErrorAlert"
import CategoryFilter from "@/components/gallery/CategoryFilter"
import GalleryMeta from "@/components/gallery/GalleryMeta"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useGalleryCategories } from "@/composables/useGalleryCategories"
import { useGalleryList } from "@/composables/useGalleryList"
import { usePageScroll } from "@/composables/usePageScroll"
import { useSearchHistory } from "@/composables/useSearchHistory"
import { formatDateTime } from "@/lib/format"
import { useAuthStore } from "@/stores/AuthStore"

/* 触底前多少像素开始加载下一页 */
const LOAD_AHEAD_PX = 600

/*
 * 图库列表：上方搜索框，下方纵向无限加载。
 *
 * 条目与滚动位置属于组件，由 KeepAlive 保留；停用时不触发无限加载。
 */
export default defineComponent({
  name: "GalleryListView",
  setup() {
    const list = reactive(useGalleryList())
    const userId = useAuthStore().user?.id
    const history = reactive(useSearchHistory(userId))
    const categories = reactive(useGalleryCategories(userId))
    const active = ref(true)
    onActivated(() => {
      active.value = true
    })
    onDeactivated(() => {
      active.value = false
    })
    const resetScroll = usePageScroll()

    const keyword = ref("")
    /* 新组件只恢复分类；KeepAlive 激活不重新搜索，也不覆盖尚未提交的输入。 */
    void list.search({ keyword: "", categories: categories.selected })

    function submit(event: Event) {
      event.preventDefault()
      runSearch()
    }

    function runSearch() {
      keyword.value = keyword.value.trim()
      history.record(keyword.value)
      void list.search({ keyword: keyword.value, categories: categories.selected })
      void resetScroll()
    }

    /* 停用时把目标换成 null：滚动监听整体拆掉，别的页面滚动不会再进到这里。 */
    useInfiniteScroll(
      () => (active.value ? window : null),
      () => void list.loadMore(),
      {
        distance: LOAD_AHEAD_PX,
        canLoadMore: () => list.hasMore && !list.loading && !list.errorMessage,
      },
    )

    return () => (
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-3">
          <form class="flex flex-wrap gap-2" onSubmit={submit}>
            {/* Input 只声明了 modelValue 一类的 props，未声明的原生属性经展开透传给根元素 */}
            <Input
              class="min-w-0 flex-1 basis-40"
              modelValue={keyword.value}
              onUpdate:modelValue={(value) => (keyword.value = String(value))}
              {...{ placeholder: "搜索标题或标签，例如 language:chinese", "aria-label": "搜索图集" }}
            />
            <Button {...{ type: "submit" }}>
              <SearchIcon />
              搜索
            </Button>
            <CategoryFilter
              selected={categories.selected}
              onApply={(selected) => {
                categories.apply(selected)
                runSearch()
              }}
            />
          </form>

          <div class="flex flex-col gap-2" aria-label="搜索历史">
            <div class="text-muted-foreground flex items-center justify-between text-xs">
              <span>搜索历史</span>
              {history.entries.length ? (
                <ConfirmDialog
                  title="清空搜索历史？"
                  description="清空后无法恢复，确定要删除全部搜索历史吗？"
                  confirmText="清空历史"
                  onConfirm={() => history.clear()}
                >
                  <Button variant="ghost" size="xs" class="cursor-pointer" {...{ type: "button" }}>
                    清空
                  </Button>
                </ConfirmDialog>
              ) : null}
            </div>
            <div class="flex flex-wrap gap-1.5">
              {history.entries.map((entry) => (
                <Badge as="span" variant="secondary" class="h-auto max-w-full gap-0 rounded-md p-0" key={entry}>
                  <Button
                    variant="ghost"
                    size="xs"
                    class="min-w-0 shrink cursor-pointer rounded-r-none"
                    {...{
                      type: "button",
                      title: entry,
                      onClick: () => {
                        keyword.value = entry
                        runSearch()
                      },
                    }}
                  >
                    <span class="truncate">{entry}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    class="cursor-pointer rounded-l-none"
                    aria-label={`删除历史：${entry}`}
                    {...{ type: "button", onClick: () => history.remove(entry) }}
                  >
                    <XIcon class="size-3" />
                  </Button>
                </Badge>
              ))}
              {!history.entries.length ? <span class="text-muted-foreground text-xs">暂无搜索历史</span> : null}
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          {list.items.map((item) => (
            <GalleryRow item={item} key={`${item.gid}-${item.token}`} />
          ))}

          {list.loading ? (
            <>
              {[0, 1, 2].map((index) => (
                <div class="flex gap-3" key={index}>
                  <Skeleton class="h-40 w-28 shrink-0 rounded-lg" />
                  <div class="flex flex-1 flex-col gap-2 py-1">
                    <Skeleton class="h-5 w-3/4" />
                    <Skeleton class="h-4 w-1/2" />
                    <Skeleton class="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {list.errorMessage ? (
            <ErrorAlert message={list.errorMessage} title="加载失败">
              <Button size="sm" variant="outline" {...{ onClick: () => void list.retry() }}>
                重试
              </Button>
            </ErrorAlert>
          ) : null}

          {!list.loading && !list.errorMessage && list.items.length === 0 ? (
            <p class="text-muted-foreground py-12 text-center text-sm">没有找到符合条件的图集。</p>
          ) : null}

          {!list.hasMore && !list.errorMessage && list.items.length > 0 ? (
            <p class="text-muted-foreground py-6 text-center text-sm">已经到底了。</p>
          ) : null}
        </div>
      </div>
    )
  },
})

/* 列表里的一行。抽出来是因为渲染逻辑比页面骨架长 */
const GalleryRow = defineComponent({
  name: "GalleryRow",
  props: { item: { type: Object as () => GalleryCard, required: true } },
  setup(props) {
    return () => (
      <RouterLink
        class="hover:bg-accent/50 flex gap-3 rounded-lg p-2 transition-colors"
        to={{ name: "gallery-detail", params: { gid: props.item.gid, token: props.item.token } }}
      >
        <img
          alt=""
          class="bg-muted h-40 w-28 shrink-0 rounded-lg object-cover"
          loading="lazy"
          src={props.item.thumbnail}
        />

        <div class="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
          <p class="line-clamp-2 text-sm leading-snug font-medium">{props.item.title}</p>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <GalleryMeta category={props.item.category} compact rating={props.item.rating} />
            <span class="text-muted-foreground">{props.item.fileCount} 页</span>
          </div>

          <p class="text-muted-foreground truncate text-xs">
            {props.item.uploader} · {formatDateTime(props.item.postedAt)}
          </p>

          {/* 标签只露前几个，全部标签在详情页看 */}
          <div class="flex flex-wrap gap-1">
            {props.item.tags.slice(0, 6).map((tag) => (
              <span class="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </RouterLink>
    )
  },
})
