/**
 * PROTOTYPE — throwaway. Ticket #212, map #211.
 *
 * VARIANT C — "Durable tray": no confirm step, no mode, no overlay.
 *
 * The claim: A and B both make selection *fragile* — it lives inside a picking
 * session, so changing the search term (or in A's Library frame, the Label
 * filter) is where a half-built selection goes to die. Here the tray is the
 * durable thing. Items are added the moment you click them, and the tray keeps
 * what you gathered while you keep browsing and re-searching.
 *
 * In the panel there is no mode at all: the Stop's Items and a live Library
 * search share the panel, and adding is a one-click hop from the lower list into
 * the upper one, undoable in place. In the Library the tray docks bottom-right,
 * survives every filter change, and is where the destination is finally chosen.
 *
 * The cost it accepts: writes happen immediately, so undo — not confirm — is the
 * only safety net, and a stale tray is a thing that can now exist.
 */
import { useMemo, useState } from "react";
import type { ItemId } from "@unshelf/shared";
import {
  ITEMS,
  ITEMS_IN_OPEN_STOP,
  OPEN_STOP,
  PLACEMENTS,
  STOPS,
  matches,
} from "./fixtures";
import { PickerLine, ProtoItemRow } from "./frames";

export const name = "Durable tray — add on click, undo not confirm";

/* ────────────────────────────── Frame 1: the panel ───────────────────────── */

export function StopPanel() {
  const [inStop, setInStop] = useState<Set<ItemId>>(
    new Set(ITEMS_IN_OPEN_STOP),
  );
  const [justAdded, setJustAdded] = useState<ItemId[]>([]);
  const [query, setQuery] = useState("");

  const results = useMemo(
    () => ITEMS.filter((item) => matches(item, query) && !inStop.has(item.id)),
    [query, inStop],
  );

  function add(id: ItemId) {
    setInStop((current) => new Set([...current, id]));
    setJustAdded((current) => [...current, id]);
  }

  function undo(id: ItemId) {
    setInStop((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setJustAdded((current) => current.filter((candidate) => candidate !== id));
  }

  return (
    <div>
      <div className="stop-view__heading">
        <h3>{OPEN_STOP.name}</h3>
        <button type="button" className="quiet-button">
          Close details
        </button>
      </div>

      {/* The Stop's own Items — never hidden; the picker lives below, not instead. */}
      <ul className="proto-stop-items">
        {ITEMS.filter((item) => inStop.has(item.id)).map((item) => (
          <li
            key={item.id}
            className={
              justAdded.includes(item.id) ? "proto-stop-items--fresh" : ""
            }
          >
            <PickerLine
              item={item}
              trailing={
                justAdded.includes(item.id) ? (
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => undo(item.id)}
                  >
                    Undo
                  </button>
                ) : null
              }
            />
          </li>
        ))}
      </ul>

      <hr className="proto-rule" />

      <p className="item-control-caption">Add from Library</p>
      <input
        className="proto-search"
        type="search"
        placeholder={`Search ${ITEMS.length} Items…`}
        aria-label="Search the Library"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {/* Before typing this is a scroll of the whole Library, not an empty box. */}
      <ul className="proto-addlist">
        {results.map((item) => {
          const placements = PLACEMENTS.get(item.id) ?? [];
          return (
            <li key={item.id}>
              <button type="button" onClick={() => add(item.id)}>
                <span aria-hidden="true">＋</span>
                <PickerLine
                  item={item}
                  note={placements.length ? placements.join(", ") : undefined}
                />
              </button>
            </li>
          );
        })}
        {results.length === 0 && (
          <li className="proto-empty">
            <p>No Items match “{query}”.</p>
            <p className="proto-future">
              future (#136): Capture “{query}” straight into this Stop
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}

/* ────────────────────────── Frame 2: the Library rows ────────────────────── */

export function LibraryBody() {
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const [tray, setTray] = useState<ItemId[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const visible = ITEMS.filter(
    (item) =>
      matches(item, query) &&
      (!label || item.labels.some((applied) => applied.name === label)),
  );

  function toggle(id: ItemId) {
    setTray((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  }

  return (
    <>
      <div className="proto-librarybar">
        <input
          className="proto-search proto-search--wide"
          type="search"
          placeholder={`Search ${ITEMS.length} Items…`}
          aria-label="Search the Library"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <fieldset className="library-label-filter">
          <legend>Filter by Label</legend>
          <button
            type="button"
            aria-pressed={label === null}
            onClick={() => setLabel(null)}
          >
            All Items
          </button>
          {["React", "Design", "Rust"].map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={label === name}
              onClick={() => setLabel(name)}
            >
              {name}
            </button>
          ))}
        </fieldset>
        <p className="proto-hint">
          Change the search or the Label filter — the tray keeps what you
          already gathered. That is the whole point of this variant.
        </p>
      </div>

      {note && <p className="proto-undo">{note}</p>}

      <ul className="library-list">
        {visible.map((item) => {
          const inTray = tray.includes(item.id);
          const placements = PLACEMENTS.get(item.id) ?? [];
          return (
            <ProtoItemRow
              key={item.id}
              item={item}
              className={inTray ? "proto-item-row--selected" : ""}
              lead={
                <button
                  type="button"
                  className="proto-plus"
                  aria-pressed={inTray}
                  aria-label={
                    inTray
                      ? `Remove ${item.title} from tray`
                      : `Gather ${item.title}`
                  }
                  onClick={() => toggle(item.id)}
                >
                  {inTray ? "✓" : "＋"}
                </button>
              }
            >
              <div className="item-control-row">
                <span className="item-control-caption">
                  {placements.length
                    ? `Stops: ${placements.join(", ")}`
                    : "Not in a Stop"}
                </span>
              </div>
            </ProtoItemRow>
          );
        })}
      </ul>

      {tray.length > 0 && (
        <aside className="proto-dock" aria-label="Gathered Items">
          <header>
            <strong>{tray.length} gathered</strong>
            <button
              type="button"
              className="quiet-button"
              onClick={() => setTray([])}
            >
              Clear
            </button>
          </header>
          <ul>
            {tray.map((id) => {
              const item = ITEMS.find((candidate) => candidate.id === id)!;
              return (
                <li key={id}>
                  <button type="button" onClick={() => toggle(id)}>
                    {item.title} ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <select
            className="item-control-input"
            defaultValue=""
            onChange={(event) => {
              const stop = STOPS.find((s) => s.id === event.target.value);
              setNote(
                stop
                  ? `Placed ${tray.length} Items in ${stop.trailName} · ${stop.name}. Undo`
                  : `Created a new Stop for ${tray.length} Items. Undo`,
              );
              setTray([]);
            }}
          >
            <option value="" disabled>
              Place all in…
            </option>
            {STOPS.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.trailName} · {stop.name}
              </option>
            ))}
            <option value="new-react">New Stop on React</option>
            <option value="new-rust">New Stop on Rust</option>
          </select>
        </aside>
      )}
    </>
  );
}
