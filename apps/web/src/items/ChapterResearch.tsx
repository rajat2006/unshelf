import type { ConfirmChaptersRequest } from "@unshelf/shared/validation";
import { DiscardChapterEdits } from "./DiscardChapterEdits";
import { useEffect, useId, useRef, useState } from "react";
import type {
  ChapterDiscoveryResult,
  ChapterPreview,
  ItemId,
  ItemDetail,
} from "@unshelf/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import {
  confirmChapters,
  ChapterConfirmationError,
  researchChapters,
} from "../api";
import type { CurrentUser } from "../application-auth/types";

const failures: Record<
  Extract<ChapterDiscoveryResult, { ok: false }>["error"],
  string
> = {
  not_found: "This Item is unavailable.",
  ineligible: "Chapter research needs a book without Parts.",
  missing_configuration:
    "Chapter research is not configured. You can still enter Parts manually.",
  usage_limit:
    "Research limit reached. Wait for your active attempt to finish or try again tomorrow.",
  timeout: "Research timed out.",
  cancelled: "Research cancelled.",
  provider_failure: "The research service failed.",
  provider_refusal: "The research service declined this request.",
  malformed_output: "The research response could not be validated.",
  incomplete_output: "The research response was incomplete.",
};
const inconclusive = {
  ambiguous_identity:
    "The book or author could not be identified unambiguously.",
  conflicting_evidence: "Contents sources conflict.",
  no_usable_contents: "No usable contents evidence was found.",
};

export function ChapterResearch({
  itemId,
  user,
  onChanged,
}: {
  itemId: ItemId;
  user: CurrentUser;
  onChanged: (item: ItemDetail) => void;
}) {
  const [preview, setPreview] = useState<ChapterPreview | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [submission, setSubmission] = useState<ConfirmChaptersRequest | null>(
    null,
  );
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardAction, setDiscardAction] = useState<"cancel" | "retry" | null>(
    null,
  );
  const dirty =
    preview?.kind === "suggestions" &&
    text !== preview.chapters.map((chapter) => chapter.title).join("\n");
  const attempt = useRef<{ controller: AbortController } | null>(null);
  const editorId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      attempt.current?.controller.abort();
      attempt.current = null;
    };
  }, []);
  const save = async () => {
    if (savingRef.current) return;
    let request = submission;
    if (!request) {
      const lines = text.split("\n");
      if (lines.some((line) => line.length > 1000)) {
        setError("Each line must be at most 1,000 characters");
        return;
      }
      if (lines.length > 1000) {
        setError("Use at most 1,000 lines, including blank lines");
        return;
      }
      const titles = lines.map((line) => line.trim()).filter(Boolean);
      if (titles.length === 0 || titles.length > 200) {
        setError(
          titles.length === 0
            ? "Enter at least one chapter title"
            : "Use at most 200 chapters",
        );
        return;
      }
      request = { titles, confirmationKey: crypto.randomUUID() };
    }
    savingRef.current = true;
    setSaving(true);
    setSubmission(request);
    setError(null);
    try {
      const item = await confirmChapters({
        user,
        itemId,
        request,
      });
      if (!mounted.current) return;
      setSubmission(null);
      setPreview(null);
      setText("");
      onChanged(item);
    } catch (failure) {
      if (!mounted.current) return;
      if (
        failure instanceof ChapterConfirmationError &&
        failure.kind !== "uncertain"
      ) {
        setSubmission(null);
        setError(
          failure.kind === "too_large"
            ? "Chapters were not saved. The request must fit within 100 KB. Shorten the list or titles and try again."
            : "Chapters were not saved. Your edits are still here; check the titles and try again.",
        );
      } else {
        setError(
          "The save could not be confirmed. Retry saving the same chapters to resolve it.",
        );
      }
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const start = async () => {
    if (attempt.current) return;
    const active = { controller: new AbortController() };
    attempt.current = active;
    setPending(true);
    setPreview(null);
    setError(null);
    setText("");
    const timer = setTimeout(() => {
      if (attempt.current !== active) return;
      active.controller.abort();
      attempt.current = null;
      setPending(false);
      setError(failures.timeout);
    }, 65_000);
    active.controller.signal.addEventListener(
      "abort",
      () => clearTimeout(timer),
      { once: true },
    );
    try {
      const result = await researchChapters({
        user,
        itemId,
        signal: active.controller.signal,
      });
      if (attempt.current !== active) return;
      if (result.ok) {
        setPreview(result.preview);
        setText(
          result.preview.chapters.map((chapter) => chapter.title).join("\n"),
        );
      } else setError(failures[result.error]);
    } catch {
      if (attempt.current === active)
        setError("The research service could not be reached.");
    } finally {
      clearTimeout(timer);
      if (attempt.current === active) {
        attempt.current = null;
        setPending(false);
      }
    }
  };
  const cancel = () => {
    attempt.current?.controller.abort();
    attempt.current = null;
    setPending(false);
    setPreview(null);
    setText("");
    setError(null);
  };
  const requestAction = (action: "cancel" | "retry") => {
    if (dirty) setDiscardAction(action);
    else if (action === "cancel") cancel();
    else void start();
  };
  return (
    <section className="grid gap-3 border-t pt-5" aria-label="Chapter research">
      <Button
        type="button"
        variant="secondary"
        disabled={pending || saving || submission !== null}
        onClick={() => requestAction("retry")}
      >
        {error || preview ? "Retry research" : "Find chapters"}
      </Button>
      {pending && (
        <p role="status">
          Finding evidenced chapters… This can take up to a minute.
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      {preview && (
        <div className="grid min-w-0 gap-3" role="status">
          {preview.kind === "inconclusive" ? (
            <p>{inconclusive[preview.reason ?? "no_usable_contents"]}</p>
          ) : (
            <>
              <h3 className="font-medium wrap-break-word">{preview.title}</h3>
              <p>
                {preview.author ?? "Author unknown"} ·{" "}
                {preview.edition ?? "Edition unknown"}
              </p>
              <p>
                {preview.coverage === "partial"
                  ? "Partial chapter list"
                  : preview.coverage === "unknown"
                    ? "Completeness unknown"
                    : "Complete chapter list"}
              </p>
              <label htmlFor={editorId}>Chapter preview</label>
              <Textarea
                id={editorId}
                value={text}
                disabled={saving || submission !== null}
                onChange={(event) => setText(event.target.value)}
                rows={10}
              />
              <Button
                type="button"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving
                  ? "Saving chapters…"
                  : submission
                    ? "Retry saving chapters"
                    : "Add chapters"}
              </Button>
              {(saving || submission) && (
                <p role="status">
                  Saving cannot be canceled. Leaving this page may still save
                  your chapters.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Evidence supports the original suggestions below. Your edits are
                not source-verified.
              </p>
              <ol className="grid gap-2 text-sm">
                {preview.chapters.map((chapter, index) => (
                  <li key={index} className="wrap-break-word">
                    {chapter.title}{" "}
                    {chapter.evidence.map((id) => {
                      const source = preview.sources.find(
                        (entry) => entry.id === id,
                      );
                      return source && /^https?:\/\//i.test(source.url) ? (
                        <a
                          key={id}
                          className="underline"
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                        >
                          {source.title}
                        </a>
                      ) : null;
                    })}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
      {(pending || preview || error) && (
        <Button
          type="button"
          variant="quiet"
          disabled={saving || submission !== null}
          onClick={() => requestAction("cancel")}
        >
          Cancel research
        </Button>
      )}
      <DiscardChapterEdits
        dirty={dirty || submission !== null}
        saving={saving || submission !== null}
        open={discardAction !== null}
        onKeep={() => setDiscardAction(null)}
        onDiscard={() => {
          const action = discardAction;
          setDiscardAction(null);
          if (action === "cancel") cancel();
          else void start();
        }}
      />
    </section>
  );
}
