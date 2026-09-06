import { defineComponent, onDeactivated, ref } from "vue"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

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
    onDeactivated(() => {
      open.value = false
    })

    return () => (
      <AlertDialog open={open.value} onUpdate:open={(value) => (open.value = value)}>
        <AlertDialogTrigger asChild>{slots.default?.()}</AlertDialogTrigger>
        <AlertDialogContent class="w-[calc(100%-2rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle>{props.title}</AlertDialogTitle>
            <AlertDialogDescription>{props.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel class="cursor-pointer">取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" class="cursor-pointer" {...{ onClick: () => emit("confirm") }}>
              {props.confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  },
})
