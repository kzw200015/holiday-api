import { useInfiniteScroll } from "@vueuse/core"
import { SearchIcon } from "@lucide/vue"
import { defineComponent, ref, watch } from "vue"
import { RouterLink, useRoute, useRouter } from "vue-router"

import { galleryCategories, type GalleryCard } from "@/api/eh"
import ErrorAlert from "@/components/ErrorAlert"
import GalleryMeta from "@/components/gallery/GalleryMeta"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime } from "@/lib/format"
import { useGalleryListStore } from "@/stores/GalleryListStore"

/* 触底前多少像素开始加载下一页 */
const LOAD_AHEAD_PX = 600

/*
 * 图库列表：上方搜索框，下方纵向无限加载。
 *
 * 已加载的条目存在 GalleryListStore 里，所以从详情页或阅读视图回来时不用重新翻；
 * 滚动位置由路由的 scrollBehavior 负责恢复。
 */
export default defineComponent({
  name: "GalleryListView",
  setup() {
    const route = useRoute()
    const router = useRouter()
    const listStore = useGalleryListStore()

    const keyword = ref("")
    const selected = ref<string[]>([])

    /* 条件变了才重来；原路返回时条件没变，直接沿用已加载的内容 */
    function applyRoute() {
      const nextKeyword = typeof route.query.keyword === "string" ? route.query.keyword : ""
      const nextCategories = typeof route.query.categories === "string" ? route.query.categories.split(",") : []
      keyword.value = nextKeyword
      /* URL 是输入边界，只接受已登记的分类，同时去重并固定顺序。 */
      selected.value = galleryCategories
        .filter(({ value }) => nextCategories.includes(value))
        .map(({ value }) => value)

      void listStore.search({ keyword: nextKeyword, categories: selected.value })
    }

    /* 搜索条件写进地址栏：既能分享和刷新还原，也天然成了「重新搜索」的信号 */
    function submit(event: Event) {
      event.preventDefault()
      void router.push({
        name: "gallery-list",
        query: {
          keyword: keyword.value || undefined,
          categories: selected.value.join(",") || undefined,
        },
      })
    }

    function toggleCategory(value: string) {
      selected.value = selected.value.includes(value)
        ? selected.value.filter((item) => item !== value)
        : [...selected.value, value]
    }

    watch(
      () => route.fullPath,
      () => {
        if (route.name === "gallery-list") {
          applyRoute()
        }
      },
      { immediate: true },
    )

    useInfiniteScroll(() => window, () => void listStore.loadMore(), {
      distance: LOAD_AHEAD_PX,
      canLoadMore: () => listStore.hasMore && !listStore.loading && !listStore.errorMessage,
    })

    return () => (
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-3">
          <form class="flex gap-2" onSubmit={submit}>
            {/* Input 只声明了 modelValue 一类的 props，原生属性经展开透传给根元素 */}
            <Input
              modelValue={keyword.value}
              {...{
                placeholder: "搜索标题或标签，例如 language:chinese",
                "onUpdate:modelValue": (value: string | number) => (keyword.value = String(value)),
                "aria-label": "搜索图集",
              }}
            />
            <Button {...{ type: "submit" }}>
              <SearchIcon />
              搜索
            </Button>
          </form>

          {/* 一个都不选等于不过滤，和全选是一回事 */}
          <div class="flex flex-wrap gap-1.5">
            {galleryCategories.map((category) => (
              <Badge
                as="button"
                aria-pressed={selected.value.includes(category.value)}
                class="cursor-pointer select-none"
                key={category.value}
                variant={selected.value.includes(category.value) ? "default" : "outline"}
                {...{ onClick: () => toggleCategory(category.value) }}
              >
                {category.label}
              </Badge>
            ))}
          </div>
        </div>

        <div class="flex flex-col gap-3">
          {listStore.items.map((item) => (
            <GalleryRow item={item} key={`${item.gid}-${item.token}`} />
          ))}

          {listStore.loading ? (
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

          {listStore.errorMessage ? (
            <ErrorAlert message={listStore.errorMessage} title="加载失败">
              <Button size="sm" variant="outline" {...{ onClick: () => void listStore.retry() }}>
                重试
              </Button>
            </ErrorAlert>
          ) : null}

          {!listStore.loading && !listStore.errorMessage && listStore.items.length === 0 ? (
            <p class="text-muted-foreground py-12 text-center text-sm">没有找到符合条件的图集。</p>
          ) : null}

          {!listStore.hasMore && !listStore.errorMessage && listStore.items.length > 0 ? (
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
