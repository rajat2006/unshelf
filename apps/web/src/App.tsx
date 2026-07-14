import { useCallback, useEffect, useState } from "react";
import {
  ITEM_TYPES,
  type Item,
  type ItemStatus,
  type ItemType,
} from "@unshelf/shared";
import { captureItem, fetchAll } from "./api";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useCurrentUser,
  type CurrentUser,
} from "./auth";

/**
 * The v1 shell, gated by Google sign-in. A signed-out visitor sees only the
 * sign-in call to action (Clerk's allowlist + invitations decide whether that
 * sign-in is admitted); a signed-in User sees their space: capture an Item and
 * browse All (issue #17). Everything reflows to phone width so an Item can be
 * captured the moment it is found (ADR-0008).
 */
export function App() {
  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: "40rem",
        margin: "0 auto",
        padding: "clamp(1rem, 4vw, 2rem)",
        boxSizing: "border-box",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1 style={{ margin: 0 }}>Unshelf</h1>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <SignedOut>
        <section style={{ marginTop: "2rem" }}>
          <p>An invite-only place to organise your learning. Sign in to begin.</p>
          <SignInButton>
            <button
              type="button"
              style={{
                fontSize: "1rem",
                padding: "0.75rem 1.25rem",
                minHeight: "44px",
                cursor: "pointer",
              }}
            >
              Sign in with Google
            </button>
          </SignInButton>
        </section>
      </SignedOut>

      <SignedIn>
        <CurrentSpace />
      </SignedIn>
    </main>
  );
}

/** The signed-in view: capture an Item, then browse it in All. */
function CurrentSpace() {
  const user = useCurrentUser();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await fetchAll(user));
      setError(null);
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section style={{ marginTop: "2rem" }}>
      <AddItemForm user={user} onCaptured={refresh} />
      <All items={items} error={error} />
    </section>
  );
}

const TYPE_LABELS: Record<ItemType, string> = {
  article: "Article",
  video: "Video",
  playlist: "Playlist",
  course: "Course",
  book: "Book",
  other: "Other",
};

/**
 * The Add Item form: the one uniform capture (ADR-0007) — required title, a
 * chosen Type (no default), an optional Source. Pasting a link and adding an
 * offline book by title are the same submit; the link just fills Source.
 */
function AddItemForm({
  user,
  onCaptured,
}: {
  user: CurrentUser;
  onCaptured: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ItemType | "">("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && type !== "" && !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (type === "" || title.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await captureItem(user, { title, type, source: source || null });
      setTitle("");
      setType("");
      setSource("");
      await onCaptured();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const field: React.CSSProperties = {
    fontSize: "1rem",
    padding: "0.6rem 0.75rem",
    minHeight: "44px",
    boxSizing: "border-box",
    width: "100%",
  };
  const labelStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
    >
      <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Add an item</h2>
      <label style={labelStyle}>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What did you find?"
          required
          style={field}
        />
      </label>
      <label style={labelStyle}>
        Type
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ItemType | "")}
          required
          style={field}
        >
          <option value="" disabled>
            Choose a type…
          </option>
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        Source <span style={{ opacity: 0.6 }}>(optional link)</span>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste a link, or leave blank for an offline item"
          style={field}
        />
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          fontSize: "1rem",
          padding: "0.75rem 1.25rem",
          minHeight: "44px",
          cursor: canSubmit ? "pointer" : "not-allowed",
          alignSelf: "flex-start",
        }}
      >
        {saving ? "Adding…" : "Add to All"}
      </button>
      {error && <p style={{ color: "crimson" }}>Could not add: {error}</p>}
    </form>
  );
}

const STATUS_LABELS: Record<ItemStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

/** All: every captured Item, newest first — the query "every Item where user = me". */
function All({ items, error }: { items: Item[] | null; error: string | null }) {
  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1.2rem" }}>All</h2>
      {error && <p style={{ color: "crimson" }}>Could not reach your space: {error}</p>}
      {!items && !error && <p>Loading your space…</p>}
      {items && items.length === 0 && (
        <p style={{ opacity: 0.7 }}>Nothing captured yet — add your first item above.</p>
      )}
      {items && items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                padding: "0.75rem 0",
                borderTop: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                {item.title}
              </div>
              <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                {TYPE_LABELS[item.type]} · {STATUS_LABELS[item.status]}
              </div>
              {item.source && <Source source={item.source} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Render a Source: clickable when it parses as an http(s) URL, otherwise inert
 * text — Source is stored verbatim and may not be a link at all (ADR-0007).
 */
function Source({ source }: { source: string }) {
  let href: string | null = null;
  try {
    const url = new URL(source);
    if (url.protocol === "http:" || url.protocol === "https:") href = source;
  } catch {
    href = null;
  }
  const style: React.CSSProperties = {
    fontSize: "0.85rem",
    overflowWrap: "anywhere",
  };
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" style={style}>
      {source}
    </a>
  ) : (
    <div style={{ ...style, opacity: 0.7 }}>{source}</div>
  );
}
