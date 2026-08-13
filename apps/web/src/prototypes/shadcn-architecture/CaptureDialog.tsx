import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CAPTURE_TYPES = ["Article", "Book", "Course", "Podcast", "Video"];

export function CaptureDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) return;
    setTitle("");
    setType("");
    setSource("");
    setSaving(false);
  }, [open]);

  const canSubmit = title.trim().length > 0 && type.length > 0 && !saving;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    window.setTimeout(() => onOpenChange(false), 650);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-[var(--radius-panel)] p-0 sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader className="gap-3 p-6 pr-16">
            <DialogTitle className="font-serif text-3xl font-semibold tracking-tight">
              Capture
            </DialogTitle>
            <DialogDescription className="text-base leading-7">
              New Items land in your Library—never directly in a Learning Plan.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 px-6 pb-6">
            <div className="grid gap-2">
              <Label htmlFor="capture-title">Title</Label>
              <Input
                id="capture-title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="What did you find?"
                autoFocus
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="capture-type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="capture-type" className="w-full">
                  <SelectValue placeholder="Choose a type…" />
                </SelectTrigger>
                <SelectContent>
                  {CAPTURE_TYPES.map((captureType) => (
                    <SelectItem key={captureType} value={captureType}>
                      {captureType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="capture-source">
                Source
                <span className="font-normal text-muted-foreground">
                  Optional link
                </span>
              </Label>
              <Input
                id="capture-source"
                type="url"
                value={source}
                onChange={(event) => setSource(event.currentTarget.value)}
                placeholder="https://…"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Stored exactly as entered so the original remains easy to find.
              </p>
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 rounded-b-[var(--radius-panel)] border-t bg-quiet-panel p-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? (
                <LoaderCircle
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              ) : (
                <Plus data-icon="inline-start" aria-hidden="true" />
              )}
              {saving ? "Adding…" : "Add to Library"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
