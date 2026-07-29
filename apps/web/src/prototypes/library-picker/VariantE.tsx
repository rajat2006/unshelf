/**
 * PROTOTYPE — throwaway, round 2. Ticket #212, map #211.
 *
 * VARIANT E — "One at a time, done properly": the Library has no multi-select at
 * all. It keeps today's shape and today's gesture; the gesture is just fixed.
 *
 * The bet: if the Stop panel is already a good multi-add surface (round 1,
 * variant C), then the Library never needs to be one. Its job is to point *this*
 * Item somewhere — small N on the destination side, which is the direction that
 * was never hard. What's broken today is only that the `<select>` shows bare Stop
 * names, so two Stops called "Week 2" on different Trails are indistinguishable.
 *
 * ⚠ This contradicts a map Note settled while charting — "multi-select is
 * required … in any of the four doors". Choosing E means reopening that.
 */
import { useState } from "react";
import type { Item, ItemId } from "@unshelf/shared";
import { ITEMS, PLACEMENTS, STOPS, matches } from "../item-picker/fixtures";
import { ProtoItemRow } from "../item-picker/frames";

export const name = "One at a time — no selection, the row gesture fixed";

export function LibraryBody() {
  const [query, setQuery] = useState("");
  const [placed, setPlaced] = useState<Map<ItemId, string[]>>(new Map());

  const visible = ITEMS.filter((item) => matches(item, query));

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
        <p className="proto-hint">
          No checkboxes, no mode, no tray. One Item, one destination — and the
          destination now says which Trail it is on.
        </p>
      </div>

      <ul className="library-list">
        {visible.map((item) => (
          <PlacementRow
            key={item.id}
            item={item}
            extra={placed.get(item.id) ?? []}
            onPlace={(where) =>
              setPlaced((current) => {
                const next = new Map(current);
                next.set(item.id, [...(next.get(item.id) ?? []), where]);
                return next;
              })
            }
            onUnplace={(where) =>
              setPlaced((current) => {
                const next = new Map(current);
                next.set(
                  item.id,
                  (next.get(item.id) ?? []).filter((one) => one !== where),
                );
                return next;
              })
            }
          />
        ))}
      </ul>
    </>
  );
}

function PlacementRow({
  item,
  extra,
  onPlace,
  onUnplace,
}: {
  item: Item;
  extra: string[];
  onPlace: (where: string) => void;
  onUnplace: (where: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const existing = PLACEMENTS.get(item.id) ?? [];
  const all = [...existing, ...extra];

  return (
    <ProtoItemRow item={item}>
      <div className="item-control-row proto-placement">
        <span className="item-control-caption">In</span>
        {all.length === 0 && (
          <span className="item-control-caption">no Stop yet</span>
        )}
        {/* Placement is shown as removable chips, each naming its Trail. */}
        {all.map((where) => (
          <span key={where} className="proto-place-chip">
            {where}
            {extra.includes(where) && (
              <button
                type="button"
                aria-label={`Remove ${item.title} from ${where}`}
                onClick={() => onUnplace(where)}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          className="item-control-button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          Add to…
        </button>
      </div>

      {/* Destination side only — small N, so a grouped list beats a <select>. */}
      {open && (
        <div
          className="proto-destinations"
          role="group"
          aria-label="Destinations"
        >
          {["React", "Rust"].map((trail) => (
            <div key={trail}>
              <p className="item-control-caption">{trail}</p>
              <ul>
                {STOPS.filter((stop) => stop.trailName === trail).map(
                  (stop) => {
                    const where = `${stop.trailName} · ${stop.name}`;
                    const already = all.includes(where);
                    return (
                      <li key={stop.id}>
                        <button
                          type="button"
                          disabled={already}
                          onClick={() => {
                            onPlace(where);
                            setOpen(false);
                          }}
                        >
                          {stop.name}
                          {already && " · already here"}
                        </button>
                      </li>
                    );
                  },
                )}
                <li>
                  <button
                    type="button"
                    className="proto-newstop"
                    onClick={() => {
                      onPlace(`${trail} · new Stop`);
                      setOpen(false);
                    }}
                  >
                    ＋ New Stop on {trail}
                  </button>
                </li>
              </ul>
            </div>
          ))}
        </div>
      )}
    </ProtoItemRow>
  );
}
