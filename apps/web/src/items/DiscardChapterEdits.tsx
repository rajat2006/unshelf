import { UNSAFE_DataRouterContext, useBlocker } from "react-router";
import { useContext, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function DiscardChapterEdits({
  dirty,
  saving = false,
  open,
  onKeep,
  onDiscard,
}: {
  dirty: boolean;
  saving?: boolean;
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const router = useContext(UNSAFE_DataRouterContext);
  return (
    <>
      {router && dirty && (
        <ChapterNavigationGuard dirty={dirty} saving={saving} />
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onKeep();
        }}
      >
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogTitle>Discard edited chapters?</DialogTitle>
          <DialogDescription>
            {saving
              ? "Saving cannot be canceled. Leaving may still save your chapters."
              : "Your preview is temporary. Leaving will lose these edits."}
          </DialogDescription>
          <Button type="button" onClick={onKeep}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            Discard edits
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChapterNavigationGuard({
  dirty,
  saving,
}: {
  dirty: boolean;
  saving: boolean;
}) {
  const blocker = useBlocker(dirty);
  return blocker.state === "blocked" ? (
    <DiscardChapterEdits
      dirty={false}
      saving={saving}
      open
      onKeep={() => blocker.reset()}
      onDiscard={() => blocker.proceed()}
    />
  ) : null;
}
