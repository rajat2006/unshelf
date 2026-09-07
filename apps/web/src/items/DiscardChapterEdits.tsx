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
  open,
  onKeep,
  onDiscard,
}: {
  dirty: boolean;
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
      {router && dirty && <ChapterNavigationGuard dirty={dirty} />}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onKeep();
        }}
      >
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogTitle>Discard edited chapters?</DialogTitle>
          <DialogDescription>
            Your preview is temporary. Leaving will lose these edits.
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

function ChapterNavigationGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(dirty);
  return blocker.state === "blocked" ? (
    <DiscardChapterEdits
      dirty={false}
      open
      onKeep={() => blocker.reset()}
      onDiscard={() => blocker.proceed()}
    />
  ) : null;
}
