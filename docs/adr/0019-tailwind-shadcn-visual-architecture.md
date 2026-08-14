# The web interface uses Tailwind and repository-owned shadcn components

The coordinated interface rewrite in PRD
[#342](https://github.com/rajat2006/unshelf/issues/342) needs one visual
architecture that implementation agents can discover and extend without creating
parallel styling or component systems. The completed architecture decision map
[#321](https://github.com/rajat2006/unshelf/issues/321) selected the system, and
the disposable
[#322 validation slice](https://github.com/rajat2006/unshelf/issues/322) resolved
its visual, accessibility, agent-discovery, maintenance, and weight evidence.

## Decision

The production web interface uses Tailwind CSS v4 as its styling system and
repository-owned shadcn components with the Radix base as its generic component
catalogue. A centralized semantic CSS-variable contract owns resolved Light and
Dark appearances and maps shared values into Tailwind. Light is the default;
Light, Dark, and System remain persistent User preferences, with System resolving
to Light or Dark.

Ownership is layered:

1. The global foundation owns themes, shared values, reset/base treatment, and
   genuinely global behavior.
2. The local shadcn catalogue owns recurring generic controls and their finite
   variants. Generated source becomes Unshelf-owned source once added.
3. Domain-owned components own recurring Unshelf presentations such as Item
   Status.
4. Rooms and features own unique composition, product behavior, and
   behavior-coupled geometry, including the Learning Plan topology.

Radix is the base for generic complex interactions in the local catalogue.
Product-specific interactions stay local when generic primitive behavior would
change their contract; visual resemblance alone does not move ownership. The
Frontend and UI coding standard owns the operational discovery, import, and
extension workflow at this boundary.

Exact current values, catalogue APIs, and variants live only in executable
production sources. The Frontend and UI coding standard is the operational route
from `apps/web/components.json` to those sources. No permanent styling guide,
Storybook, or component gallery mirrors them.

## Accepted costs and constraints

The architecture accepts utility-heavy feature source, nontrivial bundle weight,
and overwrite-and-reconcile reviews when updating customized shadcn source. These
costs are outweighed by centralized semantics, local ownership, discoverability,
reuse, and uniformity.

Tailwind CSS v4 sets the production browser floor at Safari 16.4+, Chrome 111+,
and Firefox 128+. Supporting older browsers is outside this architecture.

Styling-specific lint rules and architecture scanners are deferred. Review and
conforming executable examples are the initial enforcement boundary; mechanical
enforcement should follow only after repeated drift exposes a stable rule.

## Considered alternatives

- A styled component system or a second primitive family was rejected because it
  would split visual and interaction ownership.
- Local CSS or CSS-in-JS alongside Tailwind was rejected because recurring values
  and resolved themes would gain competing authorities.
- A permanent prose catalogue was rejected because it would cache executable
  values and variants and inevitably drift.
- Promoting the disposable prototype was rejected because it was validation
  evidence, not production-quality application code.

## Consequences

The production configuration, semantic stylesheet, local catalogue, domain
components, ordinary usages, and focused tests are the current authority. New
recurring values or variants are promoted at the owning executable layer; unique
feature geometry remains local.

The cool-indigo theme and canvas styling in ADR-0012, ADR-0010, and
`docs/ui-design-spec.md` remain useful history but are superseded as current
visual authority. Their routing, domain, and topology decisions continue where
later ADRs have not superseded them.
