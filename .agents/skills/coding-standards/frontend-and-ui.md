# Frontend and UI

Unshelf's production interface uses Tailwind CSS v4 and repository-owned shadcn
components with the Radix base. ADR-0019 owns the architecture and its rationale;
this reference owns the implementation discovery workflow.

Start at `apps/web/components.json`: its Tailwind stylesheet is the executable
semantic Light/Dark contract, and its aliases locate the local catalogue and
shared helpers. Read those sources for current values, variants, and component
APIs; find representative usages and focused tests with repository search.

Follow **discover → reuse → extend**:

1. Search the configured catalogue alias, usages, and neighboring tests; reuse a
   component's public API and supported variant when its behavior matches.
2. Before extending, identify the owning layer from ADR-0019's ownership model.
3. Change the executable source at that layer, then check its representative
   usages and focused tests.

Import generic controls through the configured local catalogue alias, not directly
from its primitive dependency. When the available primitive behavior differs from
the product interaction, keep the interaction at its feature seam.

For changes to these ownership boundaries or their enforcement policy, consult
ADR-0019.
