import { BookOpenIcon } from "@lucide/vue"
import { computed, defineComponent } from "vue"
import { RouterLink } from "vue-router"

import {
  fetchGalleryComments,
  fetchGalleryDetail,
  type GalleryComment,
} from "@/api/eh"
import { useQuery } from "@/composables/useQuery"
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
  props: {
    gid: { type: Number, required: true },
    token: { type: String, required: true },
  },
  setup(props) {

    const identity = () => `${props.gid}/${props.token}`
    const { data: detail, error, loading } = useQuery(identity, (_identity, signal) =>
      fetchGalleryDetail(props.gid, props.token, signal),
    )
    const gallery = computed(() => detail.value?.gallery)
    const progress = computed(() => detail.value?.progress)
    /* 评论需要抓取上游页面，独立加载，失败不阻塞元数据。 */
    const { data: comments, error: commentsError, loading: commentsLoading } = useQuery(identity, (_identity, signal) =>
      fetchGalleryComments(props.gid, props.token, signal),
    )

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
        ) : error.value ? (
          <ErrorAlert message={error.value.message} title="加载失败" />
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
                  <ErrorAlert message={commentsError.value.message} title="评论加载失败" />
                ) : comments.value?.length === 0 ? (
                  <p class="text-muted-foreground text-sm">还没有评论。</p>
                ) : (
                  comments.value?.map((comment, index) => (
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
