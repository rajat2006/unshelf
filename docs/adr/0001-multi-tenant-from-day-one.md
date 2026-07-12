# Multi-tenant from day one

Unshelf v1 is a multi-user product, not a single-user personal tool — despite
originating from the founder's own pain. Every entity (items, schedules,
reminders) is scoped to a User: an individual tenant owning a private, isolated
space, with no teams or sharing in v1. We chose this over the smaller single-user
cut because the founder intends Unshelf to become a real product (invite-only at
launch, public self-serve soon), and retrofitting multi-tenancy onto a
single-user data model later is far costlier than designing for it now.

## Consequences

- Auth and accounts are mandatory in v1 — Google social login, invite-gated
  (provider chosen in "Choose the stack & hosting", #11).
- Hosting must be always-on and multi-tenant with per-User isolation — no
  local-only/desktop-only option. Constrains "Choose the platform" (#10) and
  "Choose the stack & hosting" (#11).
- Every downstream domain model must scope its data to a User.
- Teams/collaboration and monetization are explicitly out of scope for v1.
