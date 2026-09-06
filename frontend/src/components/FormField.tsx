import { defineComponent } from "vue"

import { Input } from "@/components/ui/input"

/**
 * 表单里的一项：标签 + 单行输入框。
 *
 * 登录页和设置页原先各抄了一份同样的 label/Input 结构，间距和 for/id 的配对全靠人手对齐；
 * 收进这里之后，表单外观只有一个出处。标签样式差异（如 Cookie 名用等宽）经 labelClass 传入。
 */
export default defineComponent({
  name: "FormField",
  props: {
    id: { type: String, required: true },
    label: { type: String, required: true },
    modelValue: { type: String, required: true },
    type: { type: String, default: "text" },
    placeholder: { type: String, default: "" },
    autocomplete: { type: String, default: "off" },
    labelClass: { type: String, default: "" },
  },
  emits: { "update:modelValue": (value: string) => typeof value === "string" },
  setup(props, { emit }) {
    return () => (
      <div class="flex flex-col gap-2">
        <label class={["text-sm font-medium", props.labelClass]} for={props.id}>
          {props.label}
        </label>
        {/* Input 只声明了 modelValue 一类的 props，未声明的原生属性经展开透传给根元素 */}
        <Input
          modelValue={props.modelValue}
          onUpdate:modelValue={(value) => emit("update:modelValue", String(value))}
          {...{
            autocomplete: props.autocomplete,
            id: props.id,
            placeholder: props.placeholder,
            type: props.type,
          }}
        />
      </div>
    )
  },
})
