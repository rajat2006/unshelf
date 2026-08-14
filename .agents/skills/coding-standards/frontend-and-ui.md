# Frontend and UI

Unshelf's production interface uses Tailwind CSS v4 and repository-owned shadcn
components with the Radix base. Start at `apps/web/components.json`: its Tailwind
stylesheet is the executable semantic Light/Dark contract, and its aliases locate
the local catalogue and shared helpers. Read those sources for current values,
variants, and component APIs; find representative usages and focused tests with
repository search.

Follow **discover → reuse → extend**:

1. Reuse a catalogue component and supported variant when it matches the required
   behavior.
2. Extend the local catalogue for recurring generic controls, or a domain-owned
   component for recurring Unshelf presentations.
3. Keep unique composition, product interactions, and behavior-coupled geometry
   in the owning room or feature.

Feature code imports the local catalogue rather than Radix directly. A generic
primitive is appropriate only when its behavior matches the product interaction;
for example, URL-owned Item detail remains a feature-owned non-modal panel. Lucide
is the canonical icon source.

Review is the initial enforcement boundary. Add a mechanical styling rule only
after repeated drift demonstrates a stable rule worth enforcing.
