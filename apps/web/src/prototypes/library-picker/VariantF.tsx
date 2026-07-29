/**
 * PROTOTYPE — throwaway, round 2. Ticket #212, map #211.
 *
 * VARIANT F — "Filing session": choose the destination *first*, then file.
 *
 * The inversion: every other variant asks you to select Items and then say where
 * they go, which is what forces selection chrome onto a triage surface. Here you
 * pin a destination once — "filing into React · Week 2" — and from then on each
 * row carries a single ＋ that files it immediately. No checkboxes, no tray, no
 * confirm, no mode change to the rows themselves: you can still triage Status and
 * Labels mid-session, because the rows never changed.
 *
 * Multi-add falls out for free (click ＋ four times) without any concept of
 * "selection" existing at all. Undo is per-row and stays put.
 */
import { useState } from "react";
import type { ItemId } from "@unshelf/shared";
import { ITEMS, PLACEMENTS, STOPS, matches } from "../item-picker/fixtures";
import { ProtoItemRow } from "../item-picker/frames";

export const name = "Filing session — pin a destination, then ＋ each row";

export function LibraryBody() {
  const [destination, setDestination] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const [filed, setFiled] = useState<ItemId[]>([]);

  const visible = ITEMS.filter(
    (item) =>
      matches(item, query) &&
      (!label || item.labels.some((applied) => applied.name === label)),
  );

  function file(id: ItemId) {
    setFiled((current) => [...current, id]);
  }

  function unfile(id: ItemId) {
    setFiled((current) => current.filter((candidate) => candidate !== id));
  }

  return (
    <>
      {/* The session header — the only new furniture, and it is not per-row. */}
      <div className="proto-session" data-on={destination !== null}>
        {destination === null ? (
          <>
            <span className="item-control-caption">
              Adding several Items somewhere?
            </span>
            <select
              className="item-control-input"
              defaultValue=""
              onChange={(event) =>
                event.target.value && setDestination(event.target.value)
              }
            >
              <option value="" disabled>
                Start filing into…
              </option>
              {STOPS.map((stop) => (
                <option
                  key={stop.id}
                  value={`${stop.trailName} · ${stop.name}`}
                >
                  {stop.trailName} · {stop.name}
                </option>
              ))}
              <option value="React · new Stop">New Stop on React</option>
              <option value="Rust · new Stop">New Stop on Rust</option>
            </select>
          </>
        ) : (
          <>
            <strong>Filing into {destination}</strong>
            <span className="item-control-caption">
              {filed.length} filed so far
            </span>
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                setDestination(null);
                setFiled([]);
              }}
            >
              Stop filing
            </button>
          </>
        )}
      </div>

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
          Search and filter freely mid-session — nothing is being held in a
          selection, so nothing can be lost.
        </p>
      </div>

      <ul className="library-list">
        {visible.map((item) => {
          const placements = PLACEMENTS.get(item.id) ?? [];
          const done = filed.includes(item.id);
          return (
            <ProtoItemRow
              key={item.id}
              item={item}
              className={done ? "proto-item-row--selected" : ""}
              lead={
                destination === null ? undefined : done ? (
                  <button
                    type="button"
                    className="proto-plus proto-plus--done"
                    aria-label={`Undo filing ${item.title}`}
                    onClick={() => unfile(item.id)}
                  >
                    ✓
                  </button>
                ) : (
                  <button
                    type="button"
                    className="proto-plus"
                    aria-label={`File ${item.title} into ${destination}`}
                    onClick={() => file(item.id)}
                  >
                    ＋
                  </button>
                )
              }
            >
              <div className="item-control-row">
                <span className="item-control-caption">
                  {done
                    ? `In ${destination} · just filed`
                    : placements.length
                      ? `Stops: ${placements.join(", ")}`
                      : "Not in a Stop"}
                </span>
                {destination === null && (
                  <>
                    {" "}
                    <button type="button" className="item-control-button">
                      Add to…
                    </button>
                  </>
                )}
              </div>
            </ProtoItemRow>
          );
        })}
        {visible.length === 0 && (
          <li className="proto-empty">
            <p>No Items match “{query}”.</p>
            <p className="proto-future">
              future (#136): Capture “{query}”{" "}
              {destination ? `straight into ${destination}` : "as a new Item"}
            </p>
          </li>
        )}
      </ul>
    </>
  );
}
