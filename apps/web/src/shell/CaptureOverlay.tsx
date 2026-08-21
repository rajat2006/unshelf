import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ITEM_TYPES, Type } from "@unshelf/shared";
import { captureItem } from "../api";
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
import { prepareYouTubeSourceInspection } from "./youtubeSourceInspection";

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
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Type | "">("");
  const [source, setSource] = useState("");
  const [titleSuggested, setTitleSuggested] = useState(false);
  const [typeSuggested, setTypeSuggested] = useState(false);
  const [inspectionStatus, setInspectionStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<CaptureErrors>({});
  const [requestFailed, setRequestFailed] = useState(false);
  const titleOwned = useRef(false);
  const typeOwned = useRef(false);
  const titleSuggestion = useRef(false);
  const typeSuggestion = useRef(false);
  // Source work can settle out of order; only its starting revision may update Capture.
  const sourceRevision = useRef(0);
  const activeInspection = useRef<AbortController | null>(null);
  const visibleDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelActiveInspection = useCallback((): void => {
    activeInspection.current?.abort();
    activeInspection.current = null;
    if (visibleDeadline.current !== null) {
      clearTimeout(visibleDeadline.current);
      visibleDeadline.current = null;
    }
  }, []);

  const invalidateInspection = useCallback((): void => {
    sourceRevision.current += 1;
    cancelActiveInspection();
  }, [cancelActiveInspection]);

  function clearPriorSuggestions(): void {
    if (titleSuggestion.current && !titleOwned.current) setTitle("");
    if (typeSuggestion.current && !typeOwned.current) setType("");
    titleSuggestion.current = false;
    typeSuggestion.current = false;
    setTitleSuggested(false);
    setTypeSuggested(false);
  }

  useEffect(() => {
    if (sourceRevision.current === 0) return;
    const revision = sourceRevision.current;
    const debounce = setTimeout(() => {
      if (revision !== sourceRevision.current) return;
      const prepared = prepareYouTubeSourceInspection(source);
      if (prepared === null) return;

      if (!typeOwned.current) {
        setType(prepared.type);
        setErrors((current) => ({ ...current, type: undefined }));
        typeSuggestion.current = true;
        setTypeSuggested(true);
      }
      setInspectionStatus("Checking YouTube details…");

      const settle = (suggestedTitle: boolean) => {
        if (revision !== sourceRevision.current) return;
        activeInspection.current = null;
        if (visibleDeadline.current !== null) {
          clearTimeout(visibleDeadline.current);
          visibleDeadline.current = null;
        }
        if (suggestedTitle) {
          setInspectionStatus("YouTube details were suggested.");
        } else if (typeSuggestion.current && !typeOwned.current) {
          setInspectionStatus(
            `${TYPE_LABELS[prepared.type]} Type was suggested; enter Title manually.`,
          );
        } else {
          setInspectionStatus("Your entries were kept.");
        }
      };

      if (titleOwned.current) {
        settle(false);
        return;
      }

      const controller = new AbortController();
      activeInspection.current = controller;
      let settled = false;
      const settleOnce = (suggestedTitle: boolean) => {
        if (settled) return;
        settled = true;
        settle(suggestedTitle);
      };
      visibleDeadline.current = setTimeout(() => {
        controller.abort();
        settleOnce(false);
      }, 3_000);

      void prepared.acquireTitle(controller.signal).then((acquiredTitle) => {
        if (
          revision !== sourceRevision.current ||
          acquiredTitle === null ||
          titleOwned.current
        ) {
          settleOnce(false);
          return;
        }
        setTitle(acquiredTitle);
        setErrors((current) => ({ ...current, title: undefined }));
        titleSuggestion.current = true;
        setTitleSuggested(true);
        settleOnce(true);
      });
    }, 300);

    return () => clearTimeout(debounce);
  }, [source]);

  useEffect(
    () => () => {
      invalidateInspection();
    },
    [invalidateInspection],
  );

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

    invalidateInspection();
    setInspectionStatus("");
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
        <Field>
          <FieldLabel id="capture-source-label" htmlFor="capture-source">
            Source
          </FieldLabel>
          <Input
            id="capture-source"
            aria-labelledby="capture-source-label"
            value={source}
            onChange={(event) => {
              invalidateInspection();
              clearPriorSuggestions();
              setInspectionStatus("");
              setSource(event.target.value);
            }}
            placeholder="Paste a link, or leave blank for an offline Item"
            autoFocus
          />
          <FieldDescription>
            Optional; stored exactly as entered.
          </FieldDescription>
        </Field>

        <Field data-invalid={Boolean(errors.title)}>
          <div className="flex items-baseline justify-between gap-3">
            <FieldLabel id="capture-title-label" htmlFor="capture-title">
              Title
            </FieldLabel>
            {titleSuggested && (
              <span className="text-xs text-muted-foreground">Suggested</span>
            )}
          </div>
          <Input
            ref={titleRef}
            id="capture-title"
            value={title}
            onChange={(event) => {
              titleOwned.current = true;
              titleSuggestion.current = false;
              setTitleSuggested(false);
              if (activeInspection.current !== null) {
                sourceRevision.current += 1;
                cancelActiveInspection();
                setInspectionStatus(
                  typeSuggestion.current && !typeOwned.current && type !== ""
                    ? `${TYPE_LABELS[type]} Type was suggested; your Title was kept.`
                    : "Your entries were kept.",
                );
              }
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
          <div className="flex items-baseline justify-between gap-3">
            <FieldLabel id="capture-type-label" htmlFor="capture-type">
              Type
            </FieldLabel>
            {typeSuggested && (
              <span className="text-xs text-muted-foreground">Suggested</span>
            )}
          </div>
          <Select
            value={type}
            onValueChange={(value) => {
              typeOwned.current = true;
              typeSuggestion.current = false;
              setTypeSuggested(false);
              setType(value as Type);
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

        <p
          role="status"
          aria-live="polite"
          className="min-h-5 text-sm text-muted-foreground"
        >
          {inspectionStatus}
        </p>

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
