import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ITEM_TYPES,
  SOURCE_INSPECTION_SOURCE_BYTE_LIMIT,
  Type,
} from "@unshelf/shared";
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

function requiredTitleError(title: string): string | undefined {
  return title.trim().length === 0 ? "Enter a title." : undefined;
}

function requiredTypeError(type: Type | ""): string | undefined {
  return type === "" ? "Choose a type." : undefined;
}

function isRequiredTypeSelected(type: Type | ""): type is Type {
  return requiredTypeError(type) === undefined;
}

type InspectionState =
  | { status: "idle" }
  | { status: "inspecting" }
  | { status: "suggested"; title: boolean; type: boolean }
  | { status: "unavailable" };

type FieldOwnership = "unowned" | "suggested" | "user";

const INSPECTION_DEBOUNCE_MS = 300;
const INSPECTION_DEADLINE_MS = 3_000;
function isInspectionEligible(source: string): boolean {
  if (
    new TextEncoder().encode(source).byteLength >
    SOURCE_INSPECTION_SOURCE_BYTE_LIMIT
  ) {
    return false;
  }

  try {
    const workingUrl = new URL(source.trim());
    return workingUrl.protocol === "http:" || workingUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function inspectionMessage(inspection: InspectionState): string | null {
  if (inspection.status === "idle") return null;
  if (inspection.status === "inspecting") return "Inspecting Source…";
  if (inspection.status === "unavailable") {
    return "Source inspection unavailable. Continue manually.";
  }
  if (inspection.title && inspection.type) return "Suggested Title and Type.";
  if (inspection.title) return "Suggested Title.";
  if (inspection.type) return "Suggested Type.";
  return "Source inspected. Your entries were kept.";
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
  const inspectionDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectionDeadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectionRevision = useRef(0);
  const sourcePastePending = useRef(false);
  const fieldOwnership = useRef<{
    title: FieldOwnership;
    type: FieldOwnership;
  }>({ title: "unowned", type: "unowned" });
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Type | "">("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<CaptureErrors>({});
  const [requestFailed, setRequestFailed] = useState(false);
  const [inspection, setInspection] = useState<InspectionState>({
    status: "idle",
  });

  const clearInspectionTimers = useCallback((): void => {
    if (inspectionDebounce.current !== null) {
      clearTimeout(inspectionDebounce.current);
      inspectionDebounce.current = null;
    }
    if (inspectionDeadline.current !== null) {
      clearTimeout(inspectionDeadline.current);
      inspectionDeadline.current = null;
    }
  }, []);

  const supersedeInspection = useCallback((): number => {
    clearInspectionTimers();
    inspectionController.current?.abort();
    inspectionController.current = null;
    inspectionRevision.current += 1;
    return inspectionRevision.current;
  }, [clearInspectionTimers]);

  function startInspection(exactSource: string, revision: number): void {
    if (revision !== inspectionRevision.current) return;

    const controller = new AbortController();
    inspectionController.current = controller;
    setInspection({ status: "inspecting" });
    inspectionDeadline.current = setTimeout(() => {
      if (revision !== inspectionRevision.current) return;
      controller.abort();
      inspectionController.current = null;
      inspectionRevision.current += 1;
      setInspection({ status: "unavailable" });
    }, INSPECTION_DEADLINE_MS);

    void inspectSource(user, { source: exactSource }, controller.signal)
      .then((response) => {
        if (
          controller.signal.aborted ||
          revision !== inspectionRevision.current
        ) {
          return;
        }

        clearInspectionTimers();
        inspectionController.current = null;
        if (response.status === "unavailable") {
          setInspection({ status: "unavailable" });
          return;
        }

        let appliedTitle = false;
        let appliedType = false;
        if (
          response.title !== undefined &&
          fieldOwnership.current.title !== "user"
        ) {
          fieldOwnership.current.title = "suggested";
          appliedTitle = true;
          setTitle(response.title);
          setErrors((current) => ({ ...current, title: undefined }));
        }
        if (
          response.type !== undefined &&
          fieldOwnership.current.type !== "user"
        ) {
          fieldOwnership.current.type = "suggested";
          appliedType = true;
          setType(response.type);
          setErrors((current) => ({ ...current, type: undefined }));
        }
        setInspection({
          status: "suggested",
          title: appliedTitle,
          type: appliedType,
        });
      })
      .catch(() => {
        if (
          controller.signal.aborted ||
          revision !== inspectionRevision.current
        ) {
          return;
        }
        clearInspectionTimers();
        inspectionController.current = null;
        setInspection({ status: "unavailable" });
      });
  }

  function changeSource(nextSource: string, inspectImmediately: boolean): void {
    setSource(nextSource);
    const revision = supersedeInspection();

    if (fieldOwnership.current.title === "suggested") {
      fieldOwnership.current.title = "unowned";
      setTitle("");
    }
    if (fieldOwnership.current.type === "suggested") {
      fieldOwnership.current.type = "unowned";
      setType("");
    }
    setInspection({ status: "idle" });

    if (!isInspectionEligible(nextSource)) return;
    if (inspectImmediately) {
      startInspection(nextSource, revision);
      return;
    }
    inspectionDebounce.current = setTimeout(
      () => startInspection(nextSource, revision),
      INSPECTION_DEBOUNCE_MS,
    );
  }

  function retryInspection(): void {
    const revision = supersedeInspection();
    if (!isInspectionEligible(source)) {
      setInspection({ status: "idle" });
      return;
    }
    startInspection(source, revision);
  }

  useEffect(
    () => () => {
      supersedeInspection();
    },
    [supersedeInspection],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    supersedeInspection();
    setInspection({ status: "idle" });

    const nextErrors: CaptureErrors = {
      title: requiredTitleError(title),
      type: requiredTypeError(type),
    };
    setErrors(nextErrors);

    if (nextErrors.title || !isRequiredTypeSelected(type)) {
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

  const statusMessage = inspectionMessage(inspection);

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
              onChange={(event) => {
                const inspectImmediately = sourcePastePending.current;
                sourcePastePending.current = false;
                changeSource(event.target.value, inspectImmediately);
              }}
              onPaste={() => {
                sourcePastePending.current = true;
                queueMicrotask(() => {
                  sourcePastePending.current = false;
                });
              }}
              placeholder="Paste a link, or leave blank for an offline Item"
              autoFocus
            />
            <FieldDescription>
              Optional; stored exactly as entered.
            </FieldDescription>
          </Field>
        </div>

        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {statusMessage ?? ""}
        </p>

        {statusMessage !== null && (
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p aria-hidden="true">{statusMessage}</p>
            {inspection.status === "unavailable" && (
              <Button
                type="button"
                variant="quiet"
                size="compact"
                aria-label="Retry Source inspection"
                onClick={retryInspection}
              >
                Retry
              </Button>
            )}
          </div>
        )}

        <Field data-invalid={Boolean(errors.title)}>
          <div className="flex items-center gap-2">
            <FieldLabel id="capture-title-label" htmlFor="capture-title">
              Title
            </FieldLabel>
            {fieldOwnership.current.title === "suggested" && (
              <span className="text-xs font-normal text-primary">
                Suggested
              </span>
            )}
          </div>
          <Input
            ref={titleRef}
            id="capture-title"
            value={title}
            onChange={(event) => {
              fieldOwnership.current.title = "user";
              setTitle(event.target.value);
              setErrors((current) => ({ ...current, title: undefined }));
            }}
            onBlur={(event) => {
              const titleError = requiredTitleError(event.target.value);
              if (titleError !== undefined) {
                setErrors((current) => ({
                  ...current,
                  title: titleError,
                }));
              }
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
            {fieldOwnership.current.type === "suggested" && (
              <span className="text-xs font-normal text-primary">
                Suggested
              </span>
            )}
          </div>
          <Select
            value={type}
            onValueChange={(value) => {
              fieldOwnership.current.type = "user";
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
              onBlur={() => {
                const typeError = requiredTypeError(type);
                if (typeError !== undefined) {
                  setErrors((current) => ({
                    ...current,
                    type: typeError,
                  }));
                }
              }}
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
          disabled={
            requiredTitleError(title) !== undefined ||
            requiredTypeError(type) !== undefined
          }
          className="min-w-40 justify-self-start sm:h-10"
        >
          Add to Library
        </Button>
      </form>
    </DialogContent>
  );
}
