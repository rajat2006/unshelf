/**
 * PROTOTYPE — throwaway phone-width variants. Ticket #218, map #211.
 *
 * All three preserve the settled order: current Items first, live Library
 * intake second. They disagree about how the add → move upward → Undo transition
 * stays legible in one phone viewport without a nested vertical scroller.
 */
import { useMemo, useRef } from "react";
import {
  CurrentItems,
  LibraryIntake,
  PhoneRouteFrame,
  SectionHeading,
  scrollToSection,
  usePhoneStopState,
  type PrototypeItem,
} from "./shared";

export const VARIANT_NAMES = {
  A: "One page — follow the move",
  B: "Current-Items rail",
  C: "Undo where you tapped",
} as const;

export function VariantA() {
  const state = usePhoneStopState();
  const recentCardRef = useRef<HTMLLIElement | null>(null);

  const addAndFollow = (itemId: string) => {
    state.addItem(itemId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        recentCardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });
  };

  return (
    <PhoneRouteFrame
      state={state}
      claim="One document, no inner scrollers. The page follows an Item when it moves upward."
    >
      <nav className="phone-proto-anchor-nav" aria-label="Stop sections">
        <button type="button" onClick={() => scrollToSection("a-current")}>
          In this Stop · {state.currentItems.length}
        </button>
        <button type="button" onClick={() => scrollToSection("a-library")}>
          Add Items ↓
        </button>
      </nav>

      <section id="a-current" className="phone-proto-section">
        <SectionHeading
          title="In this Stop"
          detail={`${state.currentItems.length} current`}
        />
        <CurrentItems cardRef={recentCardRef} state={state} />
      </section>

      <section
        id="a-library"
        className="phone-proto-section phone-proto-library"
      >
        <SectionHeading
          title="Add Items from your Library"
          detail="Tap to add · page follows"
        />
        <LibraryIntake addItem={addAndFollow} state={state} />
      </section>
    </PhoneRouteFrame>
  );
}

export function VariantB() {
  const state = usePhoneStopState();

  return (
    <PhoneRouteFrame
      state={state}
      claim="Current Items become a horizontal rail, leaving the full vertical gesture to Library search."
    >
      <section className="phone-proto-section phone-proto-rail-section">
        <SectionHeading
          title="In this Stop"
          detail="Swipe sideways · vertical page stays free"
        />
        <CurrentItems compact state={state} />
      </section>

      <section className="phone-proto-section phone-proto-library">
        <SectionHeading
          title="Add Items from your Library"
          detail="Tap to add · it lands in the rail"
        />
        <LibraryIntake addItem={state.addItem} state={state} />
      </section>
    </PhoneRouteFrame>
  );
}

export function VariantC() {
  const state = usePhoneStopState();
  const echoItems = useMemo(
    () =>
      state.allItems.filter((item) => {
        const matches = item.title
          .toLowerCase()
          .includes(state.query.trim().toLowerCase());
        const isCurrent = state.currentItems.some(
          (current) => current.id === item.id,
        );
        return matches && (!isCurrent || item.id === state.recentItemId);
      }),
    [
      state.allItems,
      state.currentItems,
      state.query,
      state.recentItemId,
    ],
  );

  const renderResultOrEcho = (item: PrototypeItem) => {
    if (item.id !== state.recentItemId) {
      return (
        <button
          type="button"
          className="phone-proto-result"
          onClick={() => state.addItem(item.id)}
        >
          <span aria-hidden="true">＋</span>
          <span>
            <strong>{item.title}</strong>
            <small>
              {item.kind}
              {item.placement ? ` · ${item.placement}` : ""}
            </small>
          </span>
        </button>
      );
    }

    return (
      <div className="phone-proto-moved-echo" role="status">
        <span aria-hidden="true">↑</span>
        <span>
          <strong>Moved to In this Stop</strong>
          <small>{item.title}</small>
        </span>
        <button type="button" onClick={() => state.undoAdd(item.id)}>
          Undo
        </button>
      </div>
    );
  };

  return (
    <PhoneRouteFrame
      state={state}
      claim="The Item moves into the upper list, while a temporary echo leaves Undo exactly where the tap happened."
    >
      <section className="phone-proto-section">
        <SectionHeading
          title="In this Stop"
          detail={`${state.currentItems.length} current`}
        />
        <CurrentItems state={state} />
      </section>

      <section className="phone-proto-section phone-proto-library">
        <div className="phone-proto-sticky-intake">
          <SectionHeading
            title="Add Items from your Library"
            detail="Undo stays at the source"
          />
          <label className="phone-proto-search">
            <span className="phone-proto-search-icon" aria-hidden="true">
              ⌕
            </span>
            <span className="visually-hidden">Search your Library</span>
            <input
              type="search"
              value={state.query}
              placeholder={`Search ${state.allItems.length} Items…`}
              onChange={(event) => state.setQuery(event.target.value)}
            />
          </label>
        </div>
        <LibraryIntake
          addItem={state.addItem}
          items={echoItems}
          renderEcho={renderResultOrEcho}
          showSearch={false}
          state={state}
        />
      </section>
    </PhoneRouteFrame>
  );
}
