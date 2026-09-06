import { StarIcon } from "@lucide/vue"
import { clamp } from "@vueuse/core"
import { computed, defineComponent } from "vue"

import { categoryLabels } from "@/api/eh"
import { Badge } from "@/components/ui/badge"

/*
 * 分类徽章加评分，列表卡片和详情页共用。
 *
 * 评分按比例填充五颗星，不把小数四舍五入成整星；精确分数留给悬停与读屏。
 */
export default defineComponent({
  name: "GalleryMeta",
  props: {
    category: { type: String, required: true },
    rating: { type: Number, required: true },
    /* 列表卡片的字号比详情页小一号，星标跟着小一号 */
    compact: { type: Boolean, default: false },
  },
  setup(props) {
    /* 五星渲染的定义域是 [0, 5]，越界评分夹回来，文案与填充宽度才都合法。 */
    const rating = computed(() => clamp(props.rating, 0, 5))
    const label = computed(() => `评分 ${rating.value.toFixed(2)} / 5`)
    return () => (
      <>
        <Badge variant="secondary">{categoryLabels[props.category] ?? props.category}</Badge>
        <span class="inline-flex shrink-0 items-center gap-0.5" role="img" aria-label={label.value} title={label.value}>
          {Array.from({ length: 5 }, (_, index) => (
            <span class={["relative block", props.compact ? "size-3" : "size-3.5"]} key={index} aria-hidden="true">
              <StarIcon class="text-muted-foreground/50 size-full" />
              <span
                class="absolute inset-y-0 left-0 overflow-hidden text-amber-500 dark:text-amber-400"
                style={{ width: `${Math.round(clamp(rating.value - index, 0, 1) * 10000) / 100}%` }}
              >
                <StarIcon class={props.compact ? "size-3" : "size-3.5"} fill="currentColor" />
              </span>
            </span>
          ))}
        </span>
      </>
    )
  },
})
