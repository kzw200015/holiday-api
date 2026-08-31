import { StarIcon } from "@lucide/vue"
import { defineComponent } from "vue"

import { categoryLabels } from "@/api/eh"
import { Badge } from "@/components/ui/badge"

/*
 * 分类徽章加评分，列表卡片和详情页共用。
 *
 * 抽出来是因为这两处除了图标大小完全一样，而「分类名认不出就原样显示」
 * 和「评分保留两位小数」这两条规则各写一份的话，改一处另一处不会跟着变。
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
    return () => (
      <>
        <Badge variant="secondary">{categoryLabels[props.category] ?? props.category}</Badge>
        <span class="text-muted-foreground flex items-center gap-1">
          <StarIcon class={props.compact ? "size-3" : "size-3.5"} />
          {props.rating.toFixed(2)}
        </span>
      </>
    )
  },
})
