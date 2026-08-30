import { CircleAlertIcon } from "@lucide/vue"
import { defineComponent } from "vue"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/*
 * 页面级的报错提示。
 *
 * 抽出来是因为这块结构在每个页面都一样（图标 + 标题 + 文案），各写一份之后
 * 图标、variant、间距已经开始各漂各的了。需要在文案下面放重试按钮的页面用默认插槽。
 */
export default defineComponent({
  name: "ErrorAlert",
  props: {
    title: { type: String, required: true },
    message: { type: String, required: true },
  },
  setup(props, { slots }) {
    return () => (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>{props.title}</AlertTitle>
        <AlertDescription class="flex flex-col items-start gap-2">
          <span>{props.message}</span>
          {slots.default?.()}
        </AlertDescription>
      </Alert>
    )
  },
})
