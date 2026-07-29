/**
 * PROTOTYPE — throwaway variants. Ticket #208, map #211.
 *
 * Three variants of how an open Stop transitions from empty to populated. They
 * deliberately disagree about the relationship between the Stop's current
 * Items and the live Library picker; everything else is held constant.
 */
import type { Item } from "@unshelf/shared";
import {
  CurrentItemCard,
  LibraryResult,
  NoResults,
  PrototypeFrame,
  SearchField,
  StopPanelHeader,
  useStopPrototype,
  type StopPrototypeState,
} from "./shared";

export const VARIANT_NAMES = {
  A: "Items first — Library shelf below",
  B: "One inventory — two live groups",
  C: "Add first — current Items below",
} as const;

export function VariantA() {
  const state = useStopPrototype();
  return (
    <PrototypeFrame currentItems={state.currentItems}>
      {({ closePanel }) => (
        <div className="empty-proto-variant variant-a">
          <StopPanelHeader
            itemCount={state.currentItems.length}
            closePanel={closePanel}
            reset={state.reset}
          />

          {state.currentItems.length > 0 && (
            <section className="empty-proto-current">
              <h4>In this Stop</h4>
              <CurrentItems state={state} />
            </section>
          )}

          <section className="empty-proto-library-shelf">
            <SectionHeading
              title="Add Items from your Library"
              detail="Click to add · undo in place"
            />
            <SearchField query={state.query} setQuery={state.setQuery} />
            <AvailableItems state={state} />
          </section>
        </div>
      )}
    </PrototypeFrame>
  );
}

export function VariantB() {
  const state = useStopPrototype();
  const matchingCurrentItems = state.currentItems.filter((item) =>
    item.title.toLowerCase().includes(state.query.trim().toLowerCase()),
  );

  return (
    <PrototypeFrame currentItems={state.currentItems}>
      {({ closePanel }) => (
        <div className="empty-proto-variant variant-b">
          <StopPanelHeader
            itemCount={state.currentItems.length}
            closePanel={closePanel}
            reset={state.reset}
          />

          <section className="empty-proto-inventory">
            <SectionHeading
              title="Find Items"
              detail="Search this Stop and your Library together"
            />
            <SearchField query={state.query} setQuery={state.setQuery} />

            <div className="empty-proto-inventory-scroll">
              <section>
                <h4>
                  In this Stop{" "}
                  <span className="empty-proto-count">
                    {state.currentItems.length}
                  </span>
                </h4>
                {matchingCurrentItems.length > 0 && (
                  <ul className="empty-proto-current-list">
                    {matchingCurrentItems.map((item) => (
                      <CurrentItemCard
                        key={item.id}
                        item={item}
                        recentlyAdded={state.recentItemIds.has(item.id)}
                        undoAdd={state.undoAdd}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4>
                  Available in Library{" "}
                  <span className="empty-proto-count">
                    {state.availableItems.length}
                  </span>
                </h4>
                <AvailableItems state={state} />
              </section>
            </div>
          </section>
        </div>
      )}
    </PrototypeFrame>
  );
}

export function VariantC() {
  const state = useStopPrototype();
  return (
    <PrototypeFrame currentItems={state.currentItems}>
      {({ closePanel }) => (
        <div className="empty-proto-variant variant-c">
          <StopPanelHeader
            itemCount={state.currentItems.length}
            closePanel={closePanel}
            reset={state.reset}
          />

          <section className="empty-proto-add-first">
            <SectionHeading
              title="Add Items from your Library"
              detail="The intake stays first"
            />
            <SearchField query={state.query} setQuery={state.setQuery} />
            <AvailableItems state={state} />
          </section>

          {state.currentItems.length > 0 && (
            <section className="empty-proto-current">
              <h4>In this Stop</h4>
              <CurrentItems state={state} />
            </section>
          )}
        </div>
      )}
    </PrototypeFrame>
  );
}

function SectionHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-proto-section-heading">
      <h4>{title}</h4>
      <span>{detail}</span>
    </div>
  );
}

function CurrentItems({ state }: { state: StopPrototypeState }) {
  return (
    <ul className="empty-proto-current-list">
      {state.currentItems.map((item) => (
        <CurrentItemCard
          key={item.id}
          item={item}
          recentlyAdded={state.recentItemIds.has(item.id)}
          undoAdd={state.undoAdd}
        />
      ))}
    </ul>
  );
}

function AvailableItems({ state }: { state: StopPrototypeState }) {
  return (
    <ul className="empty-proto-results">
      {state.availableItems.map((item: Item) => (
        <LibraryResult key={item.id} item={item} addItem={state.addItem} />
      ))}
      {state.availableItems.length === 0 && <NoResults query={state.query} />}
    </ul>
  );
}
