import { defineComponent } from "vue"

import { Badge } from "@/components/ui/badge"

/** 列表与详情共用的只读标签，长标签换行而不撑宽页面。 */
export default defineComponent({
  name: "GalleryTag",
  setup(_props, { slots }) {
    return () => (
      <Badge
        variant="secondary"
        class="h-auto min-w-0 max-w-full rounded-md px-1.5 py-0.5 text-xs whitespace-normal break-all"
      >
        {slots.default?.()}
      </Badge>
    )
  },
})
