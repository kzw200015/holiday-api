import { BookOpenIcon } from "@lucide/vue"
import { computed, defineComponent, ref, watch } from "vue"
import { RouterLink, useRoute } from "vue-router"

import {
  fetchGalleryComments,
  fetchGalleryDetail,
  type GalleryComment,
  type GalleryDetail,
} from "@/api/eh"
import { errorText } from "@/api/httpClient"
import ErrorAlert from "@/components/ErrorAlert"
import GalleryMeta from "@/components/gallery/GalleryMeta"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime, formatFileSize, formatNamespace, splitTag } from "@/lib/format"

/* 图集详情：元信息、标签、评论，以及进入阅读视图的入口 */
export default defineComponent({
  name: "GalleryDetailView",
  setup() {
    const route = useRoute()

    const gallery = ref<GalleryDetail | null>(null)
    const progress = ref<number | null>(null)
    const errorMessage = ref("")
    const loading = ref(false)

    const comments = ref<GalleryComment[]>([])
    const commentsError = ref("")
    const commentsLoading = ref(false)

    /* 标签按命名空间归并，和 e 站页面上的排布一致 */
    const groupedTags = computed(() => {
      const groups = new Map<string, string[]>()
      for (const tag of gallery.value?.tags ?? []) {
        const { namespace, value } = splitTag(tag)
        /* 取出来 push，别每来一个标签就把这一组重建一遍——同命名空间几十个标签时那是 O(n²) */
        const group = groups.get(namespace)
        if (group) {
          group.push(value)
        } else {
          groups.set(namespace, [value])
        }
      }
      return [...groups.entries()]
    })

    async function load(gid: number, token: string) {
      loading.value = true
      errorMessage.value = ""
      try {
        const detail = await fetchGalleryDetail(gid, token)
        gallery.value = detail.gallery
        progress.value = detail.progress
      } catch (error) {
        gallery.value = null
        errorMessage.value = errorText(error, "加载失败")
      } finally {
        loading.value = false
      }
    }

    /* 评论要抓一次 e 站页面，比元数据慢，所以单独加载，失败也不影响上面的内容 */
    async function loadComments(gid: number, token: string) {
      commentsLoading.value = true
      commentsError.value = ""
      try {
        comments.value = await fetchGalleryComments(gid, token)
      } catch (error) {
        comments.value = []
        commentsError.value = errorText(error, "评论加载失败")
      } finally {
        commentsLoading.value = false
      }
    }

    /*
     * source 要返回原始值而不是数组：返回数组的话每次求值都是个新对象，
     * Object.is 永远判为「变了」，任何留在本路由上的地址变化都会重新拉一次详情加一次评论
     */
    watch(
      () => `${route.params.gid}/${route.params.token}`,
      () => {
        if (route.name !== "gallery-detail") {
          return
        }
        const gid = Number(route.params.gid)
        const token = String(route.params.token)
        void load(gid, token)
        void loadComments(gid, token)
      },
      { immediate: true },
    )

    return () => (
      <div class="flex flex-col gap-4">
        {loading.value ? (
          <div class="flex flex-col gap-4 sm:flex-row">
            <Skeleton class="h-72 w-52 shrink-0 rounded-lg" />
            <div class="flex flex-1 flex-col gap-3">
              <Skeleton class="h-7 w-3/4" />
              <Skeleton class="h-4 w-1/2" />
              <Skeleton class="h-4 w-2/3" />
              <Skeleton class="h-20 w-full" />
            </div>
          </div>
        ) : errorMessage.value ? (
          <ErrorAlert message={errorMessage.value} title="加载失败" />
        ) : gallery.value ? (
          <>
            <div class="flex flex-col gap-4 sm:flex-row">
              <img
                alt=""
                class="bg-muted h-72 w-52 shrink-0 self-start rounded-lg object-cover"
                src={gallery.value.thumbnail}
              />

              <div class="flex min-w-0 flex-1 flex-col gap-3">
                <div class="flex flex-col gap-1">
                  <h2 class="text-lg leading-snug font-semibold">{gallery.value.title}</h2>
                  {gallery.value.titleJpn ? (
                    <p class="text-muted-foreground text-sm">{gallery.value.titleJpn}</p>
                  ) : null}
                </div>

                <div class="flex flex-wrap items-center gap-2 text-sm">
                  <GalleryMeta category={gallery.value.category} rating={gallery.value.rating} />
                  {gallery.value.expunged ? <Badge variant="destructive">已删除</Badge> : null}
                </div>

                <dl class="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt>上传者</dt>
                  <dd class="text-foreground truncate">{gallery.value.uploader}</dd>
                  <dt>发布时间</dt>
                  <dd class="text-foreground">{formatDateTime(gallery.value.postedAt)}</dd>
                  <dt>页数</dt>
                  <dd class="text-foreground">{gallery.value.fileCount} 页</dd>
                  <dt>大小</dt>
                  <dd class="text-foreground">{formatFileSize(gallery.value.fileSize)}</dd>
                </dl>

                <div class="flex flex-wrap gap-2">
                  <Button asChild>
                    <RouterLink
                      to={{
                        name: "reader",
                        params: {
                          gid: gallery.value.gid,
                          token: gallery.value.token,
                          page: progress.value ?? 1,
                        },
                      }}
                    >
                      <BookOpenIcon />
                      {progress.value && progress.value > 1 ? `继续阅读（第 ${progress.value} 页）` : "开始阅读"}
                    </RouterLink>
                  </Button>

                  {progress.value && progress.value > 1 ? (
                    <Button asChild variant="outline">
                      <RouterLink
                        to={{
                          name: "reader",
                          params: { gid: gallery.value.gid, token: gallery.value.token, page: 1 },
                        }}
                      >
                        从头开始
                      </RouterLink>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>标签</CardTitle>
              </CardHeader>
              <CardContent class="flex flex-col gap-2">
                {groupedTags.value.length === 0 ? (
                  <p class="text-muted-foreground text-sm">这个图集还没有标签。</p>
                ) : (
                  groupedTags.value.map(([namespace, values]) => (
                    <div class="grid grid-cols-[5rem_1fr] items-baseline gap-2" key={namespace}>
                      <span class="text-muted-foreground text-xs">{formatNamespace(namespace) || "未分类"}</span>
                      <div class="flex flex-wrap gap-1">
                        {values.map((value) => (
                          <span class="bg-muted rounded px-1.5 py-0.5 text-xs" key={value}>
                            {value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>评论</CardTitle>
              </CardHeader>
              <CardContent class="flex flex-col gap-4">
                {commentsLoading.value ? (
                  <>
                    <Skeleton class="h-4 w-1/3" />
                    <Skeleton class="h-12 w-full" />
                  </>
                ) : commentsError.value ? (
                  <ErrorAlert message={commentsError.value} title="评论加载失败" />
                ) : comments.value.length === 0 ? (
                  <p class="text-muted-foreground text-sm">还没有评论。</p>
                ) : (
                  comments.value.map((comment, index) => (
                    <div class="flex flex-col gap-2" key={comment.id}>
                      {index > 0 ? <Separator /> : null}
                      <div class="flex flex-wrap items-center gap-2 text-xs">
                        <span class="font-medium">{comment.author}</span>
                        {comment.isUploader ? <Badge variant="outline">上传者</Badge> : null}
                        <span class="text-muted-foreground">{formatDateTime(comment.postedAt)}</span>
                        {comment.score ? <span class="text-muted-foreground">{comment.score}</span> : null}
                      </div>
                      <CommentBody segments={comment.segments} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    )
  },
})

/*
 * 评论正文。后端已经把 HTML 拆成片段，这里用普通节点渲染，
 * 不碰 v-html —— 那是第三方站点的用户产出内容
 */
const CommentBody = defineComponent({
  name: "CommentBody",
  props: { segments: { type: Array as () => GalleryComment["segments"], required: true } },
  setup(props) {
    return () => (
      <p class="text-sm leading-relaxed break-words">
        {props.segments.map((segment, index) => {
          if (segment.type === "break") {
            return <br key={index} />
          }
          if (segment.type === "link") {
            return (
              <a
                class="text-primary underline underline-offset-2"
                href={segment.href}
                key={index}
                rel="noreferrer noopener"
                target="_blank"
              >
                {segment.text}
              </a>
            )
          }
          return <span key={index}>{segment.text}</span>
        })}
      </p>
    )
  },
})
