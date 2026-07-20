# Multi-tenant from day one

Unshelf v1 is a multi-user product, not a single-user personal tool — despite
originating from the founder's own pain. Every entity (items, schedules,
reminders) is scoped to a User: an individual tenant owning a private, isolated
space, with no teams or sharing in v1. We chose this over the smaller single-user
cut because the founder intends Unshelf to become a real product (open
self-serve sign-up from launch), and retrofitting multi-tenancy onto a
single-user data model later is far costlier than designing for it now.

## Consequences

- Auth and accounts are mandatory in v1 — Google social login, **open sign-up**
  (provider chosen in "Choose the stack & hosting", #11).
- **Sign-up is sign-in**: there is one act. Authenticating with Google for the
  first time creates the User; there is no separate registration step, no
  allowlist, and no admission decision the product makes. Any Google account
  that authenticates gets a private, isolated space.
- Hosting must be always-on and multi-tenant with per-User isolation — no
  local-only/desktop-only option. Constrains "Choose the platform" (#10) and
  "Choose the stack & hosting" (#11).
- Every downstream domain model must scope its data to a User.
- Teams/collaboration and monetization are explicitly out of scope for v1.

## Revision — admission policy (#77)

As first written, this ADR launched **invite-gated** (Clerk's allowlist +
invitations), with public self-serve "soon". That gate is **removed**: admission
is open from launch, as recorded above. Only the *admission* policy changed —
multi-tenancy, per-User isolation, and Google as the only provider all stand
exactly as decided here.

The gate was never load-bearing for the product; it was a launch-caution knob.
Keeping it meant the signed-out screen had to explain a rejection path nobody
would hit, and every new User cost the founder a manual invitation. If abuse or
cost ever makes admission a real decision, it returns as its own ADR (e.g. a
"request an invite" flow) — reinstating it is a Clerk dashboard setting, not a
code change, because no repo code ever implemented the gate.
