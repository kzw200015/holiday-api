import {
  AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle, AlertDialogTrigger,
} from "reka-ui"
import { defineComponent, onDeactivated, ref } from "vue"

import { Button } from "@/components/ui/button"

export default defineComponent({
  name: "ConfirmDialog",
  props: {
    title: { type: String, required: true },
    description: { type: String, required: true },
    confirmText: { type: String, default: "确认" },
  },
  emits: { confirm: () => true },
  setup(props, { emit, slots }) {
    const open = ref(false)
    onDeactivated(() => { open.value = false })

    return () => <AlertDialogRoot open={open.value} {...{ "onUpdate:open": (value: boolean) => { open.value = value } }}>
      <AlertDialogTrigger asChild>{slots.default?.()}</AlertDialogTrigger>
      <AlertDialogPortal>
        <AlertDialogOverlay class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <AlertDialogContent class="bg-background fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl border p-6 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <div class="space-y-2">
            <AlertDialogTitle class="text-lg font-semibold">{props.title}</AlertDialogTitle>
            <AlertDialogDescription class="text-muted-foreground text-sm leading-relaxed">{props.description}</AlertDialogDescription>
          </div>
          <div class="flex justify-end gap-2">
            <AlertDialogCancel asChild><Button variant="outline" class="cursor-pointer">取消</Button></AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" class="cursor-pointer" {...{ onClick: () => emit("confirm") }}>{props.confirmText}</Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>
  },
})
