/**
 * PROTOTYPE — throwaway. Ticket #212, map #211.
 *
 * VARIANT B — "Command overlay": one control, many entry points.
 *
 * The claim: the narrow-panel problem *dissolves* by refusing to render inside
 * the panel. The picker is a centred overlay, so it is the same 32rem control
 * whether it was opened from the Stop panel, a Library row, or Stop creation —
 * which is exactly what the ticket asks ("does one control survive both frames").
 * Type to filter, ↑↓ to move, Enter to toggle, ⌘/Ctrl+Enter to confirm; picks
 * pile into a chip tray under the input, so the count is always visible.
 *
 * The cost it accepts: while picking you cannot see the Trail canvas or the row
 * you came from. Context is carried in the overlay's header instead of on screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Item, ItemId } from "@unshelf/shared";
import {
  ITEMS,
  ITEMS_IN_OPEN_STOP,
  OPEN_STOP,
  PLACEMENTS,
  STOPS,
  matches,
} from "./fixtures";
import { PickerLine, ProtoItemRow } from "./frames";

export const name = "Command overlay — one control, keyboard-first";

interface Target {
  label: string;
  seeded: ItemId[];
}

/* ────────────────────────────── Frame 1: the panel ───────────────────────── */

export function StopPanel() {
  const [inStop, setInStop] = useState<Set<ItemId>>(
    new Set(ITEMS_IN_OPEN_STOP),
  );
  const [target, setTarget] = useState<Target | null>(null);

  return (
    <div>
      <div className="stop-view__heading">
        <h3>{OPEN_STOP.name}</h3>
        <button type="button" className="quiet-button">
          Close details
        </button>
      </div>
      <button
        type="button"
        className="proto-primary"
        onClick={() =>
          setTarget({ label: "React · Week 2", seeded: [...inStop] })
        }
      >
        + Add Items <kbd>⌘K</kbd>
      </button>
      <ul className="proto-stop-items">
        {ITEMS.filter((item) => inStop.has(item.id)).map((item) => (
          <li key={item.id}>
            <PickerLine item={item} />
          </li>
        ))}
      </ul>
      {target && (
        <Overlay
          target={target}
          onClose={() => setTarget(null)}
          onConfirm={(ids) => {
            setInStop((current) => new Set([...current, ...ids]));
            setTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ────────────────────────── Frame 2: the Library rows ────────────────────── */

export function LibraryBody() {
  const [target, setTarget] = useState<Target | null>(null);
  const [note, setNote] = useState<string | null>(null);

  return (
    <>
      <p className="proto-hint">
        The row does not host a picker. It opens the same overlay, seeded with
        this Item already picked.
      </p>
      {note && <p className="proto-undo">{note}</p>}
      <ul className="library-list">
        {ITEMS.slice(0, 12).map((item) => (
          <ProtoItemRow key={item.id} item={item}>
            <div className="item-control-row">
              <span className="item-control-caption">
                {PLACEMENTS.get(item.id)?.length
                  ? `Stops: ${PLACEMENTS.get(item.id)!.join(", ")}`
                  : "Not in a Stop"}
              </span>{" "}
              <button
                type="button"
                className="item-control-button"
                onClick={() =>
                  setTarget({
                    label: "choose a destination",
                    seeded: [item.id],
                  })
                }
              >
                Place…
              </button>
            </div>
          </ProtoItemRow>
        ))}
      </ul>
      {target && (
        <Overlay
          target={target}
          destinationPicker
          onClose={() => setTarget(null)}
          onConfirm={(ids) => {
            setNote(`Placed ${ids.length} Items. Undo`);
            setTarget(null);
          }}
        />
      )}
    </>
  );
}

/* ───────────────────────────────── The control ───────────────────────────── */

function Overlay({
  target,
  destinationPicker = false,
  onClose,
  onConfirm,
}: {
  target: Target;
  destinationPicker?: boolean;
  onClose: () => void;
  onConfirm: (ids: ItemId[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<ItemId>>(new Set());
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const already = new Set(target.seeded);
  const results = useMemo(
    () => ITEMS.filter((item) => matches(item, query)),
    [query],
  );

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-cursor="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function toggle(item: Item) {
    if (already.has(item.id)) return;
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  return (
    <div className="proto-overlay" role="dialog" aria-modal="true">
      <div className="proto-overlay__panel">
        <header className="proto-overlay__head">
          <span className="item-control-caption">
            Add Items → {target.label}
          </span>
          {destinationPicker && (
            <select className="item-control-input" defaultValue={STOPS[1].id}>
              {STOPS.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.trailName} · {stop.name}
                </option>
              ))}
              <option value="new">New Stop on a Trail…</option>
            </select>
          )}
          <button type="button" className="quiet-button" onClick={onClose}>
            Esc
          </button>
        </header>

        <input
          className="proto-search"
          autoFocus
          type="text"
          placeholder={`Type to search ${ITEMS.length} Items…`}
          aria-label="Search the Library"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault();
              onConfirm([...picked]);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (results[cursor]) toggle(results[cursor]);
            } else if (event.key === "Escape") {
              onClose();
            }
          }}
        />

        {/* The tray: selection accumulates as chips, always visible, each undoable. */}
        {picked.size > 0 && (
          <div className="proto-tray">
            {[...picked].map((id) => {
              const item = ITEMS.find((candidate) => candidate.id === id)!;
              return (
                <button
                  key={id}
                  type="button"
                  className="proto-chip"
                  onClick={() => toggle(item)}
                >
                  {item.title} ✕
                </button>
              );
            })}
          </div>
        )}

        <ul className="proto-overlay__list" ref={listRef}>
          {results.map((item, index) => {
            const placements = PLACEMENTS.get(item.id) ?? [];
            const here = already.has(item.id);
            return (
              <li
                key={item.id}
                data-cursor={index === cursor}
                className={[
                  "proto-overlay__row",
                  index === cursor ? "proto-overlay__row--cursor" : "",
                  here ? "proto-already" : "",
                  picked.has(item.id) ? "proto-overlay__row--picked" : "",
                ].join(" ")}
                onMouseEnter={() => setCursor(index)}
                onClick={() => toggle(item)}
              >
                <span aria-hidden="true">
                  {here ? "✓" : picked.has(item.id) ? "☑" : "☐"}
                </span>
                <PickerLine
                  item={item}
                  note={
                    here
                      ? "already here"
                      : placements.length
                        ? placements.join(", ")
                        : undefined
                  }
                />
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="proto-empty">
              <p>No Items match “{query}”.</p>
              <p className="proto-future">
                future (#136): Capture “{query}” as a new Item — this row is
                where it would land
              </p>
            </li>
          )}
        </ul>

        <footer className="proto-overlay__foot">
          <span className="item-control-caption">
            ↑↓ move · Enter toggle · ⌘Enter add · Esc cancel
          </span>
          <button
            type="button"
            className="proto-primary"
            disabled={picked.size === 0}
            onClick={() => onConfirm([...picked])}
          >
            Add {picked.size || ""} Item{picked.size === 1 ? "" : "s"}
          </button>
        </footer>
      </div>
    </div>
  );
}
