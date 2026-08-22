# The v1 platform is one responsive web app — desktop-primary, online-only

Unshelf v1 ships as a **single responsive web app** and nothing else — no native
mobile app, no browser extension, no installable PWA. One hosted web client
(ADR-0001 already forces an always-on multi-tenant backend) serves both form
factors from one codebase: **desktop is primary** — the designed, fully-tested
surface where the **Trail** is built and rewired — and **mobile browser is
secondary**, a deliberately scoped day-to-day surface. We chose this because the
core promise (ADR-0002 — arrange your Trail, take the organising load off your
mind) is a large-screen, pointer-friendly canvas of sequenced Stops with parallel
forks (ADR-0004), while a native app or an extension each buys a second codebase
and a publishing treadmill for a founder still dogfooding the core loop.

## Desktop-primary, mobile-secondary — the split

- **Desktop/laptop browser** is the only place a User authors a Trail (the
  drag-and-fork canvas) and does the major organising. It is the polished, tested
  surface.
- **Mobile browser** carries the day-to-day chore subset — **capture**, browse
  **All** and **Stops**, mark **Status**, set/clear the **target date**, and
  *view* the Trail — but does **not** author the Trail's forks in v1. It must
  reflow without breaking (no horizontal scroll, tappable targets); it is not
  asked to do the hard canvas work.
- Testing scope follows: two layouts (desktop width + phone width), not a device
  matrix — no native tooling, no touch-drag-fork engineering.

## Capture channel: the in-app form only

The capture *channel* that ADR-0007 punted to this decision resolves to the web
app's own Source-first **Capture** form (optional Source + required title +
confirmed Type), reachable on both surfaces — no bookmarklet, no extension, no
mobile share-sheet. On mobile the User accepts the copy → switch → paste friction.
An eligible YouTube Source may suggest editable title and Type values inside this
same form (ADR-0020); that assistance is not another channel or flow, and the User
still explicitly chooses Add to Library.

## Online-only

v1 needs a live connection: **no offline mode, no local cache, no install**.
Plain browser, no service worker. "Multi-device" is therefore free — desktop and
phone are two browsers on one hosted account, with nothing to sync or reconcile.
Offline *content* (a physical book is an offline **Item**) is unaffected — that is
the material, not the app.

## Considered options

- **Native mobile app.** Rejected for v1: the Trail is a large-screen canvas, so
  native mobile cannot carry v1 alone — it would demand a web app *too* (two
  codebases) plus an app-store pipeline, off the dogfooding critical path.
- **Browser extension as the primary surface.** Rejected: excellent for
  capture-in-context but a poor home for building or viewing a Trail; it is a
  capture *channel*, not a platform.
- **Installable PWA (offline + share-sheet).** Deferred: a service-worker shell is
  the single vehicle that would later unlock *both* offline caching *and* mobile
  share-sheet capture — worth doing together, and not while the line is "just
  responsive in the browser."

## Consequences

- **Feeds "Choose the stack & hosting" (#11):** the stack must serve a responsive
  web client off a hosted backend — no native toolchain, no app-store pipeline, no
  offline-sync engine in v1.
- **Named fast-follows, all additive seams:** a **PWA shell** (unlocking offline +
  mobile share-sheet capture together), a **desktop extension / bookmarklet**,
  **native mobile**, and **full Trail authoring on mobile**. None reshapes the Item
  spine (ADR-0003) or the capture insert (ADR-0007) when picked up.
- **The notification-channel force in the ticket's framing is moot in v1:**
  reminders are deferred (ADR-0002, ADR-0006), so the v1 surface owes nothing
  outbound — the platform choice optimises purely for capture + organise + track.
- **No `CONTEXT.md` change:** surface / responsive-web / PWA are implementation
  choices, not domain vocabulary; the glossary stays implementation-free.
- **Resolves the map's "multi-device & offline" fog:** online-only makes
  multi-device a non-feature (one backend, many browsers) and offline an explicit
  non-goal.
