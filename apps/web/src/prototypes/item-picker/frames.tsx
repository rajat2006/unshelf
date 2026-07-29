/**
 * PROTOTYPE — throwaway. Ticket #212, map #211.
 *
 * The two *frames* the picker has to survive. This file is deliberately not part
 * of any variant: it is the app's own chrome at the app's own density, so each
 * variant is judged inside the same rectangle.
 *
 * Frame 1 — the open Stop panel: `.trail-detail-layout` puts a live canvas beside
 * a `minmax(20rem, 24rem)` `aside.stop-sidebar` (ADR-0013). The canvas here is a
 * stand-in, but it holds the width the real one holds, which is the whole point.
 *
 * Frame 2 — the Library list: `.library-surface` + `.library-list` at full row
 * density (title, type, Status, Target date, Labels, placement).
 */
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Item } from "@unshelf/shared";
import { ItemLabels } from "../../items/ItemLabels";
import { ItemStatusSelect } from "../../items/ItemStatusSelect";
import { ItemTargetDate } from "../../items/ItemTargetDate";
import { TYPE_LABELS } from "../../items/presentation";
import { ItemSource } from "../../items/ItemSource";
import { LABELS, STUB_USER } from "./fixtures";

export function StopFrame({ children }: { children: ReactNode }) {
  return (
    <div className="proto-frame">
      <p className="proto-frame__caption">
        Frame 1 — inside the open Stop, docked beside a live Trail canvas (
        <code>.stop-sidebar</code>, 20–24rem)
      </p>
      <div className="trail-detail-layout">
        <section className="trail-surface">
          <h2>Trail</h2>
          <div className="proto-canvas" aria-hidden="true">
            <span>Week 1</span>
            <span className="proto-canvas__open">Week 2</span>
            <span>Week 3</span>
            <span>Week 4</span>
          </div>
        </section>
        <aside className="stop-sidebar" aria-label="Week 2 details">
          {children}
        </aside>
      </div>
    </div>
  );
}

export function LibraryFrame({ children }: { children: ReactNode }) {
  return (
    <div className="proto-frame">
      <p className="proto-frame__caption">
        Frame 2 — the Library list, where the rows already carry Status, Target
        date, Labels and placement (<code>.library-list</code>)
      </p>
      <section className="library-surface" aria-labelledby="proto-library-h">
        <h2 id="proto-library-h">Library</h2>
        {children}
      </section>
    </div>
  );
}

/**
 * A mirror of the real `ItemRow` with a leading gutter, so a variant can put a
 * selection affordance *before* the title rather than buried in the row body.
 * Copied rather than imported precisely because that gutter is under test.
 */
export function ProtoItemRow({
  item,
  lead,
  className,
  children,
}: {
  item: Item;
  lead?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <li className={`item-row proto-item-row ${className ?? ""}`}>
      {lead && <div className="proto-item-row__lead">{lead}</div>}
      <div className="proto-item-row__body">
        <Link className="item-row__title" to={`/items/${item.id}`}>
          {item.title}
        </Link>
        <div className="item-row__type">{TYPE_LABELS[item.type]}</div>
        <ItemStatusSelect item={item} user={STUB_USER} onChanged={() => {}} />
        <ItemTargetDate item={item} user={STUB_USER} onChanged={() => {}} />
        <ItemLabels
          item={item}
          labels={LABELS}
          user={STUB_USER}
          onItemChanged={() => {}}
        />
        {children}
        {item.source && <ItemSource source={item.source} />}
      </div>
    </li>
  );
}

/**
 * The compact line a picker shows — title, type, and whatever placement marks the
 * variant has decided to carry. Not a row: this is the *result* density, and how
 * thin it can get is one of the things being judged.
 */
export function PickerLine({
  item,
  note,
  trailing,
}: {
  item: Item;
  note?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <span className="proto-line">
      <span className="proto-line__title">{item.title}</span>
      <span className="proto-line__meta">
        {TYPE_LABELS[item.type]}
        {note && <> · {note}</>}
      </span>
      {trailing}
    </span>
  );
}
