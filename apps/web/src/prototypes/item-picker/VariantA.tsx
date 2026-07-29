/**
 * PROTOTYPE — throwaway. Ticket #212, map #211.
 *
 * VARIANT A — "Inline drawer": picking is a *mode* the surface enters in place.
 *
 * The claim: the picker never leaves the rectangle it was invoked from. The Stop
 * panel swaps its contents for a search + checkbox list; the Library list grows a
 * leading checkbox gutter and a sticky action bar. Nothing overlays anything —
 * the Trail canvas stays fully visible and usable the whole time.
 *
 * The bet it makes: selection is confirmed in a batch ("Add 3 Items"), so nothing
 * is written until the User says so, and un-picking before confirm is free.
 * The cost it accepts: in the narrow panel the Stop's own Items are hidden while
 * picking, because 20rem will not hold both lists.
 */
import { useMemo, useState } from "react";
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

export const name = "Inline drawer — in-place mode, batched confirm";

/* ────────────────────────────── Frame 1: the panel ───────────────────────── */

export function StopPanel() {
  const [picking, setPicking] = useState(true);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<ItemId>>(new Set());
  const [inStop, setInStop] = useState<Set<ItemId>>(
    new Set(ITEMS_IN_OPEN_STOP),
  );
  const [undoable, setUndoable] = useState<ItemId[] | null>(null);

  const results = useMemo(
    () => ITEMS.filter((item) => matches(item, query)),
    [query],
  );
  const candidates = results.filter((item) => !inStop.has(item.id));
  const alreadyHere = results.filter((item) => inStop.has(item.id));

  function toggle(id: ItemId) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    const added = [...picked];
    setInStop((current) => new Set([...current, ...added]));
    setPicked(new Set());
    setQuery("");
    setPicking(false);
    setUndoable(added);
  }

  if (!picking) {
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
          onClick={() => setPicking(true)}
        >
          + Add Items
        </button>
        {undoable && undoable.length > 0 && (
          <p className="proto-undo">
            Added {undoable.length} Item{undoable.length === 1 ? "" : "s"}.{" "}
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                setInStop((current) => {
                  const next = new Set(current);
                  undoable.forEach((id) => next.delete(id));
                  return next;
                });
                setUndoable(null);
              }}
            >
              Undo
            </button>
          </p>
        )}
        <ul className="proto-stop-items">
          {ITEMS.filter((item) => inStop.has(item.id)).map((item) => (
            <li key={item.id}>
              <PickerLine item={item} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="proto-drawer">
      <div className="proto-drawer__head">
        <h3>Add to {OPEN_STOP.name}</h3>
        <button
          type="button"
          className="quiet-button"
          onClick={() => {
            setPicking(false);
            setPicked(new Set());
          }}
        >
          Cancel
        </button>
      </div>

      <input
        className="proto-search"
        type="search"
        autoFocus
        placeholder={`Search ${ITEMS.length} Items…`}
        aria-label="Search the Library"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {/* Before you type: the whole Library, newest first. Scroll is a real option. */}
      <p className="proto-hint">
        {query
          ? `${candidates.length} match${candidates.length === 1 ? "" : "es"}`
          : `All ${ITEMS.length} Items, newest first`}
      </p>

      <div className="proto-drawer__list">
        {candidates.length === 0 && (
          <div className="proto-empty">
            <p>No Items match “{query}”.</p>
            {/* The seam #136 will land in — reserved, not built (map Out of scope). */}
            <p className="proto-future">
              future (#136): Capture “{query}” as a new Item
            </p>
          </div>
        )}
        <ul>
          {candidates.map((item) => (
            <li key={item.id}>
              <label className="proto-check">
                <input
                  type="checkbox"
                  checked={picked.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <PickerLine
                  item={item}
                  note={
                    PLACEMENTS.get(item.id)?.length
                      ? `in ${PLACEMENTS.get(item.id)!.length} Stop${
                          PLACEMENTS.get(item.id)!.length === 1 ? "" : "s"
                        }`
                      : undefined
                  }
                />
              </label>
            </li>
          ))}
        </ul>

        {/* Already here: shown, greyed, and removable — never silently hidden. */}
        {alreadyHere.length > 0 && (
          <>
            <p className="proto-hint">Already in this Stop</p>
            <ul>
              {alreadyHere.map((item) => (
                <li key={item.id} className="proto-already">
                  <PickerLine
                    item={item}
                    trailing={
                      <button
                        type="button"
                        className="quiet-button"
                        onClick={() =>
                          setInStop((current) => {
                            const next = new Set(current);
                            next.delete(item.id);
                            return next;
                          })
                        }
                      >
                        Remove
                      </button>
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="proto-drawer__foot">
        <button
          type="button"
          className="proto-primary"
          disabled={picked.size === 0}
          onClick={confirm}
        >
          Add {picked.size || ""} Item{picked.size === 1 ? "" : "s"}
        </button>
        {picked.size > 0 && (
          <button
            type="button"
            className="quiet-button"
            onClick={() => setPicked(new Set())}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── Frame 2: the Library rows ────────────────────── */

export function LibraryBody() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<ItemId>>(new Set());
  const [placedNote, setPlacedNote] = useState<string | null>(null);

  const visible = ITEMS.filter((item) => matches(item, query));

  function toggle(id: ItemId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <input
        className="proto-search proto-search--wide"
        type="search"
        placeholder={`Search ${ITEMS.length} Items…`}
        aria-label="Search the Library"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {placedNote && <p className="proto-undo">{placedNote}</p>}
      {visible.length === 0 && (
        <div className="proto-empty">
          <p>No Items match “{query}”.</p>
          <p className="proto-future">
            future (#136): Capture “{query}” as a new Item
          </p>
        </div>
      )}
      <ul className="library-list">
        {visible.map((item) => (
          <SelectableRow
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </ul>

      {/* Selection survives as a sticky bar; the destination is chosen last. */}
      {selected.size > 0 && (
        <div className="proto-actionbar" role="region" aria-label="Selection">
          <strong>{selected.size} selected</strong>
          <label>
            <span className="item-control-caption">Add to Stop</span>
            <select
              className="item-control-input"
              defaultValue=""
              onChange={(event) => {
                const stop = STOPS.find((s) => s.id === event.target.value);
                setPlacedNote(
                  `Added ${selected.size} Items to ${stop?.trailName} · ${stop?.name}. Undo`,
                );
                setSelected(new Set());
              }}
            >
              <option value="" disabled>
                Choose a Stop…
              </option>
              {STOPS.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.trailName} · {stop.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="item-control-caption">Add to Trail</span>
            <select className="item-control-input" defaultValue="">
              <option value="" disabled>
                Choose a Trail…
              </option>
              <option value="react">React</option>
              <option value="rust">Rust</option>
            </select>
          </label>
          <button
            type="button"
            className="quiet-button"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}
    </>
  );
}

function SelectableRow({
  item,
  selected,
  onToggle,
}: {
  item: Item;
  selected: boolean;
  onToggle: () => void;
}) {
  const placements = PLACEMENTS.get(item.id) ?? [];
  return (
    <ProtoItemRow
      item={item}
      className={selected ? "proto-item-row--selected" : ""}
      lead={
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${item.title}`}
        />
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
}
