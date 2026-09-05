import { useMediaQuery } from "@vueuse/core"
import { SlidersHorizontalIcon } from "@lucide/vue"
import { defineComponent, onDeactivated, ref, type PropType } from "vue"

import { galleryCategories } from "@/api/eh"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export default defineComponent({
  name: "CategoryFilter",
  props: { selected: { type: Array as PropType<string[]>, required: true } },
  emits: { apply: (_categories: string[]) => true },
  setup(props, { emit }) {
    const mobile = useMediaQuery("(max-width: 639px)")
    const open = ref(false)
    const draft = ref<string[]>([])
    function setOpen(value: boolean) {
      if (value) draft.value = [...props.selected]
      open.value = value
    }
    onDeactivated(() => { open.value = false })
    function toggle(value: string) {
      draft.value = draft.value.includes(value) ? draft.value.filter((item) => item !== value) : [...draft.value, value]
    }
    const trigger = () => <Button variant="outline" {...{ type: "button" }} aria-label="分类筛选">
      <SlidersHorizontalIcon />分类{props.selected.length ? ` (${props.selected.length})` : ""}
    </Button>
    const choices = () => <div class="flex flex-col gap-4">
      <div class="grid grid-cols-3 gap-2">
        {galleryCategories.map((category) => <button key={category.value}
          class={["min-h-11 rounded-md border px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
            draft.value.includes(category.value) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"]}
          aria-pressed={draft.value.includes(category.value)} type="button" onClick={() => toggle(category.value)}>
          {category.label}
        </button>)}
      </div>
      <p class="text-muted-foreground text-xs">全不选或全选均表示不限分类。</p>
      <div class="flex justify-end gap-2">
        <Button variant="ghost" {...{ type: "button", onClick: () => { draft.value = [] } }}>重置</Button>
        <Button {...{ type: "button", onClick: () => { emit("apply", [...draft.value]); open.value = false } }}>应用</Button>
      </div>
    </div>
    return () => mobile.value ? <Sheet open={open.value} onUpdate:open={setOpen}>
      <SheetTrigger asChild>{trigger()}</SheetTrigger>
      <SheetContent side="bottom" class="max-h-[85svh] overflow-y-auto rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader class="p-0"><SheetTitle>分类筛选</SheetTitle><SheetDescription>选择分类后点击应用。</SheetDescription></SheetHeader>
        {choices()}
      </SheetContent>
    </Sheet> : <Popover open={open.value} onUpdate:open={setOpen}>
      <PopoverTrigger asChild>{trigger()}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} class="w-80 p-4" aria-label="分类筛选">
        <PopoverHeader><PopoverTitle>分类筛选</PopoverTitle></PopoverHeader>
        {choices()}
      </PopoverContent>
    </Popover>
  },
})
