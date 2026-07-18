# Prototype #58 — routing & deep-linking (THROWAWAY)

**Question it settled:** given we're adopting a real router, how does an open **Stop / Item**
behave — a full-page surface, or an overlay that still owns a URL? And does an open Stop get a
shareable / deep-linkable URL?

**Verdict — Variant D: non-modal right sidebar.** The panel docks right and the Trail canvas
*reflows* into the remaining width (no scrim), staying fully visible and interactive — you can
click another Stop node and the sidebar just swaps. This beat the scrim'd drawer (B) and the
centered modal (C), both of which steal focus and are wrong when you're planning against the
canvas. Full-page (A) throws the canvas away entirely. Same clean-path URL + back / refresh /
cold-deep-link in every variant — the sidebar is presentation; the route is unchanged. The same
sidebar applies to an open Item for consistency.

Deep-linking is **owner-scoped** (bookmark / refresh / back / return-after-sign-in); public
cross-user sharing is out of scope (no sharing feature on the roadmap).

**Run:** `python3 apps/web/prototype-routing-serve.py` → http://127.0.0.1:5178/
(SPA-fallback server so clean paths, refresh, and cold deep-links all work.)

Full decision recorded on issue #58 and rolled up into map #53. **Never merged to main** — the
redesign is a spec (map #53 is plan-don't-do); implementation is a downstream effort.
