import { computed, defineComponent, onMounted, reactive, ref } from "vue"
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElRadio,
  ElRadioGroup,
  ElSwitch,
  ElTag,
  ElText,
} from "element-plus"

import {
  CODEX_PROMPT_SOURCE,
  getCodexPromptConfig,
  type CodexPromptSource,
  updateCodexPromptConfig,
} from "@/api/codexApi.ts"
import { formatDateTime } from "@/views/codex-accounts/utils.ts"

type PromptConfigForm = {
  source: CodexPromptSource
  customPrompt: string
  forceOverride: boolean
}

export default defineComponent({
  name: "CodexPromptConfigCard",
  setup() {
    const loading = ref(false)
    const saving = ref(false)
    const updatedAt = ref("")
    const form = reactive<PromptConfigForm>({
      source: CODEX_PROMPT_SOURCE.OPENCODE,
      customPrompt: "",
      forceOverride: false,
    })

    const isCustomSource = computed(() => form.source === CODEX_PROMPT_SOURCE.CUSTOM)

    const refreshPromptConfig = async () => {
      loading.value = true
      try {
        const config = await getCodexPromptConfig()
        form.source = config.source
        form.customPrompt = config.customPrompt
        form.forceOverride = config.forceOverride
        updatedAt.value = config.updatedAt
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      void refreshPromptConfig()
    })

    const savePromptConfig = async () => {
      saving.value = true
      try {
        const config = await updateCodexPromptConfig({
          source: form.source,
          customPrompt: form.customPrompt,
          forceOverride: form.forceOverride,
        })
        form.source = config.source
        form.customPrompt = config.customPrompt
        form.forceOverride = config.forceOverride
        updatedAt.value = config.updatedAt
        ElMessage.success("提示词配置已保存")
      } finally {
        saving.value = false
      }
    }

    return () => (
      <div class="space-y-4">
        <ElForm labelPosition="top" v-loading={loading.value}>
          <ElFormItem label="系统提示词来源">
            <ElRadioGroup
              modelValue={form.source}
              onUpdate:modelValue={(value) => {
                form.source = value as CodexPromptSource
              }}
            >
              <ElRadio value={CODEX_PROMPT_SOURCE.OPENCODE}>opencode</ElRadio>
              <ElRadio value={CODEX_PROMPT_SOURCE.CUSTOM}>自定义</ElRadio>
            </ElRadioGroup>
          </ElFormItem>

          <ElFormItem label="自定义提示词">
            <ElInput
              type="textarea"
              rows={7}
              disabled={!isCustomSource.value}
              placeholder="请输入自定义系统提示词"
              modelValue={form.customPrompt}
              onUpdate:modelValue={(value: string) => {
                form.customPrompt = value
              }}
            />
          </ElFormItem>

          <ElFormItem label="是否强制覆盖系统提示词">
            <ElSwitch
              modelValue={form.forceOverride}
              onUpdate:modelValue={(value) => {
                form.forceOverride = value as boolean
              }}
            />
          </ElFormItem>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <ElTag type={form.forceOverride ? "danger" : "info"}>
                {form.forceOverride ? "强制覆盖" : "按请求保留"}
              </ElTag>
              <ElText class="text-xs text-[var(--el-text-color-secondary)]">
                更新时间：{updatedAt.value ? formatDateTime(updatedAt.value) : "-"}
              </ElText>
            </div>

            <ElButton
              type="primary"
              loading={saving.value}
              disabled={loading.value}
              onClick={() => {
                void savePromptConfig()
              }}
            >
              保存
            </ElButton>
          </div>
        </ElForm>
      </div>
    )
  },
})
