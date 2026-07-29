/**
 * PROTOTYPE — throwaway, round 2. Ticket #212, map #211.
 *
 * VARIANT D — "Gather mode": selection is a mode the Library *enters*, and
 * entering it changes the shape of the list.
 *
 * The diagnosis this answers: a permanent checkbox gutter is weird because the
 * Library is a triage surface — dense cards with their own Status, Target date
 * and Labels — and a checkbox turns a card list into a table-with-selection.
 * So there is no checkbox until you ask for one. Press Gather and the rows
 * collapse to one compact line each, which is what makes picking several
 * physically possible; press Done and the triage list comes back untouched.
 */
import { useState } from "react";
import type { ItemId } from "@unshelf/shared";
import { ITEMS, PLACEMENTS, STOPS, matches } from "../item-picker/fixtures";
import { PickerLine, ProtoItemRow } from "../item-picker/frames";

export const name = "Gather mode — the list changes shape while you pick";

export function LibraryBody() {
  const [gathering, setGathering] = useState(false);
  const [query, setQuery] = useState("");
  const [gathered, setGathered] = useState<ItemId[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const visible = ITEMS.filter((item) => matches(item, query));

  function toggle(id: ItemId) {
    setGathered((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : [...current, id],
    );
  }

  return (
    <>
      <div className="proto-librarybar">
        <div className="proto-libraryhead">
          <input
            className="proto-search proto-search--wide"
            type="search"
            placeholder={`Search ${ITEMS.length} Items…`}
            aria-label="Search the Library"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {gathering ? (
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                setGathering(false);
                setGathered([]);
              }}
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              className="item-control-button"
              onClick={() => setGathering(true)}
            >
              Gather Items…
            </button>
          )}
        </div>
        <p className="proto-hint">
          {gathering
            ? "Gathering — rows are compact so you can see twenty at once. Escape or Done returns to triage."
            : "Triage as normal. No selection furniture until you ask for it."}
        </p>
      </div>

      {note && <p className="proto-undo">{note}</p>}

      {/* Triage shape: the Library exactly as it is today. */}
      {!gathering && (
        <ul className="library-list">
          {visible.map((item) => {
            const placements = PLACEMENTS.get(item.id) ?? [];
            return (
              <ProtoItemRow key={item.id} item={item}>
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
      )}

      {/* Gathering shape: one compact line per Item, nothing else. */}
      {gathering && (
        <ul className="proto-compact">
          {visible.map((item) => {
            const placements = PLACEMENTS.get(item.id) ?? [];
            const picked = gathered.includes(item.id);
            return (
              <li key={item.id} className={picked ? "proto-compact--on" : ""}>
                <button type="button" onClick={() => toggle(item.id)}>
                  <span aria-hidden="true">{picked ? "☑" : "☐"}</span>
                  <PickerLine
                    item={item}
                    note={placements.length ? placements.join(", ") : undefined}
                  />
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="proto-empty">
              <p>No Items match “{query}”.</p>
              <p className="proto-future">
                future (#136): Capture “{query}” as a new Item
              </p>
            </li>
          )}
        </ul>
      )}

      {gathering && gathered.length > 0 && (
        <div className="proto-actionbar" role="region" aria-label="Gathered">
          <strong>{gathered.length} gathered</strong>
          <div className="proto-tray">
            {gathered.map((id) => {
              const item = ITEMS.find((candidate) => candidate.id === id)!;
              return (
                <button
                  key={id}
                  type="button"
                  className="proto-chip"
                  onClick={() => toggle(id)}
                >
                  {item.title} ✕
                </button>
              );
            })}
          </div>
          <select
            className="item-control-input"
            defaultValue=""
            onChange={(event) => {
              const stop = STOPS.find((s) => s.id === event.target.value);
              setNote(
                `Added ${gathered.length} Items to ${
                  stop ? `${stop.trailName} · ${stop.name}` : "a new Stop"
                }. Undo`,
              );
              setGathered([]);
              setGathering(false);
            }}
          >
            <option value="" disabled>
              Add all to…
            </option>
            {STOPS.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.trailName} · {stop.name}
              </option>
            ))}
            <option value="new-react">New Stop on React</option>
            <option value="new-rust">New Stop on Rust</option>
          </select>
        </div>
      )}
    </>
  );
}
