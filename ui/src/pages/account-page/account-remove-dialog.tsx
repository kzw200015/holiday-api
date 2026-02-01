import { type AccountListItem } from "@/lib/api/account"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type AccountRemoveDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    item?: AccountListItem
    onConfirm: (id: string) => Promise<void> | void
    loading: boolean
}

export function AccountRemoveDialog({ open, onOpenChange, item, onConfirm, loading }: AccountRemoveDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>确认删除</DialogTitle>
                    <DialogDescription>
                        该操作不可恢复。请再次确认要删除账号：{item?.name ?? "-"}
                    </DialogDescription>
                </DialogHeader>

                <DialogFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
                        取消
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            if (item) {
                                void onConfirm(item.id)
                            }
                        }}
                        disabled={loading || !item}
                    >
                        {loading ? "删除中…" : "再次确认删除"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
