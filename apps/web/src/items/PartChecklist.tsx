import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ItemDetail, Part } from "@unshelf/shared";
import {
  createParts,
  removePart,
  reorderParts,
  updatePart,
  updatePartCompletion,
} from "../api";
import type { CurrentUser } from "../application-auth/types";

interface PartChecklistProps {
  item: ItemDetail;
  user: CurrentUser;
  onChanged: (item: ItemDetail) => void;
}

export function PartChecklist({ item, user, onChanged }: PartChecklistProps) {
  const [titles, setTitles] = useState("");
  const [error, setError] = useState<string | null>(null);

  const change = async (operation: () => Promise<ItemDetail>) => {
    setError(null);
    try {
      onChanged(await operation());
      return true;
    } catch (caught: unknown) {
      setError(String(caught));
      return false;
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const submittedTitles = titles.split("\n");
    const changed = await change(() =>
      createParts(user, item.id, submittedTitles),
    );
    if (changed) setTitles("");
  };

  const move = (part: Part, offset: -1 | 1) => {
    const currentIndex = item.parts.findIndex(({ id }) => id === part.id);
    const next = [...item.parts];
    const destination = currentIndex + offset;
    [next[currentIndex], next[destination]] = [
      next[destination],
      next[currentIndex],
    ];
    void change(() =>
      reorderParts(
        user,
        item.id,
        next.map(({ id }) => id),
      ),
    );
  };

  return (
    <section className="part-checklist" aria-labelledby="parts-heading">
      <div className="part-checklist__heading">
        <h3 id="parts-heading">Parts</h3>
        {item.partPercentage !== null && (
          <span>{item.partPercentage}% complete</span>
        )}
      </div>
      {item.parts.length === 0 ? (
        <p className="quiet-copy">No Parts yet</p>
      ) : (
        <ol aria-label="Parts">
          {item.parts.map((part, index) => (
            <PartRow
              key={part.id}
              part={part}
              first={index === 0}
              last={index === item.parts.length - 1}
              onCompletion={(completed) =>
                void change(() =>
                  updatePartCompletion(user, item.id, part.id, completed),
                )
              }
              onRename={(title) =>
                void change(() => updatePart(user, item.id, part.id, title))
              }
              onMove={(offset) => move(part, offset)}
              onRemove={() =>
                void change(() => removePart(user, item.id, part.id))
              }
            />
          ))}
        </ol>
      )}
      <form
        className="part-checklist__add"
        onSubmit={(event) => void add(event)}
      >
        <label htmlFor={`new-parts-${item.id}`}>New Part titles</label>
        <textarea
          id={`new-parts-${item.id}`}
          value={titles}
          onChange={(event) => setTitles(event.target.value)}
          placeholder="One title per line"
        />
        <button
          type="submit"
          className="quiet-button"
          disabled={!titles.trim()}
        >
          Add Parts
        </button>
      </form>
      {error && <p role="alert">Could not update Parts: {error}</p>}
    </section>
  );
}

function PartRow({
  part,
  first,
  last,
  onCompletion,
  onRename,
  onMove,
  onRemove,
}: {
  part: Part;
  first: boolean;
  last: boolean;
  onCompletion: (completed: boolean) => void;
  onRename: (title: string) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(part.title);
  useEffect(() => setTitle(part.title), [part.title]);

  return (
    <li>
      <label className="part-checklist__completion">
        <input
          type="checkbox"
          checked={part.completed}
          onChange={(event) => onCompletion(event.target.checked)}
        />
        <span>{part.title}</span>
      </label>
      <label>
        <span className="visually-hidden">Title for {part.title}</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="part-checklist__actions">
        <button
          type="button"
          onClick={() => onRename(title)}
          disabled={!title.trim()}
        >
          Save {title.trim() || "Part"}
        </button>
        <button type="button" onClick={() => onMove(-1)} disabled={first}>
          Move {part.title} up
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={last}>
          Move {part.title} down
        </button>
        <button type="button" onClick={onRemove}>
          Remove {part.title}
        </button>
      </div>
    </li>
  );
}
