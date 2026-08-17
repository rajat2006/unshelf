import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { ITEM_TYPES, Type } from "@unshelf/shared";
import { captureItem, inspectSource } from "../api";
import { useCurrentUser } from "../application-auth/useCurrentUser";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TYPE_LABELS } from "../items/presentation";

interface CaptureOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptured: () => void;
}

interface CaptureErrors {
  title?: string;
  type?: string;
}

/** The one global, non-navigating manual Capture into the Library. */
export function CaptureOverlay({
  isOpen,
  onClose,
  onCaptured,
}: CaptureOverlayProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {isOpen && <CaptureComposer onCaptured={onCaptured} onClose={onClose} />}
    </Dialog>
  );
}

function CaptureComposer({
  onCaptured,
  onClose,
}: {
  onCaptured: () => void;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const titleRef = useRef<HTMLInputElement>(null);
  const inspectionController = useRef<AbortController | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Type | "">("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<CaptureErrors>({});
  const [requestFailed, setRequestFailed] = useState(false);
  const [typeSuggested, setTypeSuggested] = useState(false);

  useEffect(
    () => () => {
      inspectionController.current?.abort();
    },
    [],
  );

  function inspectPastedSource(event: ClipboardEvent<HTMLInputElement>): void {
    event.preventDefault();
    const pastedSource = event.clipboardData.getData("text");
    setSource(pastedSource);
    setTypeSuggested(false);
    inspectionController.current?.abort();
    const controller = new AbortController();
    inspectionController.current = controller;

    void inspectSource(user, { source: pastedSource }, controller.signal)
      .then((response) => {
        if (
          !controller.signal.aborted &&
          response.status === "suggested" &&
          response.type !== undefined
        ) {
          setType(response.type);
          setTypeSuggested(true);
          setErrors((current) => ({ ...current, type: undefined }));
        }
      })
      .catch(() => undefined);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    const nextErrors: CaptureErrors = {};
    if (title.trim().length === 0) nextErrors.title = "Enter a title.";
    if (type === "") nextErrors.type = "Choose a type.";
    setErrors(nextErrors);

    if (nextErrors.title || type === "") {
      if (nextErrors.title) titleRef.current?.focus();
      else document.getElementById("capture-type")?.focus();
      return;
    }

    setSaving(true);
    setRequestFailed(false);
    try {
      await captureItem(
        user,
        source.length === 0 ? { title, type } : { title, type, source },
      );
      onCaptured();
      onClose();
    } catch {
      setRequestFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent aria-describedby="capture-description">
      <DialogHeader>
        <DialogTitle>Capture</DialogTitle>
        <DialogDescription id="capture-description">
          New Items land in your Library — never directly in a Learning Plan.
        </DialogDescription>
      </DialogHeader>

      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        className="grid gap-5"
      >
        <div className="rounded-[var(--radius-control)] border-2 border-primary/25 bg-card p-3 shadow-sm focus-within:border-primary/60">
          <Field>
            <FieldLabel id="capture-source-label" htmlFor="capture-source">
              Source
            </FieldLabel>
            <Input
              id="capture-source"
              aria-labelledby="capture-source-label"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              onPaste={inspectPastedSource}
              placeholder="Paste a link, or leave blank for an offline Item"
              autoFocus
            />
            <FieldDescription>
              Optional; stored exactly as entered.
            </FieldDescription>
          </Field>
        </div>

        <Field data-invalid={Boolean(errors.title)}>
          <FieldLabel id="capture-title-label" htmlFor="capture-title">
            Title
          </FieldLabel>
          <Input
            ref={titleRef}
            id="capture-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setErrors((current) => ({ ...current, title: undefined }));
            }}
            placeholder="What did you find?"
            aria-labelledby="capture-title-label"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "capture-title-error" : undefined}
          />
          {errors.title && (
            <FieldError id="capture-title-error">{errors.title}</FieldError>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.type)}>
          <div className="flex items-center gap-2">
            <FieldLabel id="capture-type-label" htmlFor="capture-type">
              Type
            </FieldLabel>
            {typeSuggested && (
              <span className="text-xs font-normal text-primary">
                Suggested
              </span>
            )}
          </div>
          <Select
            value={type}
            onValueChange={(value) => {
              setType(value as Type);
              setTypeSuggested(false);
              setErrors((current) => ({ ...current, type: undefined }));
            }}
          >
            <SelectTrigger
              id="capture-type"
              className="h-11 w-full sm:h-10"
              aria-labelledby="capture-type-label"
              aria-invalid={Boolean(errors.type)}
              aria-describedby={errors.type ? "capture-type-error" : undefined}
            >
              <SelectValue placeholder="Choose a type…" />
            </SelectTrigger>
            <SelectContent>
              {ITEM_TYPES.map((itemType) => (
                <SelectItem key={itemType} value={itemType}>
                  {TYPE_LABELS[itemType]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.type && (
            <FieldError id="capture-type-error">{errors.type}</FieldError>
          )}
        </Field>

        {requestFailed && (
          <Alert>
            Couldn&apos;t capture this Item. Check your connection and try
            again.
          </Alert>
        )}

        <Button
          type="submit"
          size="touch"
          loading={saving}
          loadingLabel="Adding to Library…"
          className="min-w-40 justify-self-start sm:h-10"
        >
          Add to Library
        </Button>
      </form>
    </DialogContent>
  );
}
