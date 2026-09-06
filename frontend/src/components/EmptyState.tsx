import { defineComponent } from "vue"

/** 页面和卡片共用的空状态；紧凑模式用于卡片内部与辅助信息。 */
export default defineComponent({
  name: "EmptyState",
  props: {
    message: { type: String, required: true },
    compact: { type: Boolean, default: false },
  },
  setup(props) {
    return () => (
      <p role="status" class={["text-muted-foreground text-sm", props.compact ? "py-2" : "py-12 text-center"]}>
        {props.message}
      </p>
    )
  },
})
