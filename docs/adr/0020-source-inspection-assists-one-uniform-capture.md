# Source inspection assists one uniform Capture

Capture may inspect an eligible HTTP(S) Source once to suggest an editable title
and Type before the User explicitly adds the Item to the Library. We accepted
bounded, ephemeral assistance because it removes routine transcription while
preserving ADR-0007's deeper boundary: there is still one Capture, manual and
offline Capture remain complete, Source stays verbatim, and inspection creates
neither an Item nor a durable metadata projection.

## Contract

- Source is the first Capture field. Pasting an eligible absolute HTTP(S) value
  starts inspection immediately; typing or editing one starts inspection after a
  brief input pause. Inspection has a hard three-second deadline and never blocks
  editing.
- The result contains independent optional title and Type suggestions with
  ephemeral evidence. At least one suggestion is success; full versus partial
  success derives from which suggestions are present. Missing evidence, an
  unsupported representation, policy refusal, timeout, and operational failure
  share one quiet unavailable state while retaining a bounded internal reason.
- The visible lifecycle is _idle_, _inspecting_, _suggested_, or _unavailable_.
  Cancellation and supersession are invisible. Only the latest attempt for the
  current Source revision may affect the form; late responses are ignored.
- Changing Source cancels the current attempt and clears only untouched
  suggestions from the previous Source. A blank, invalid, or non-HTTP(S) value
  starts no inspection but remains valid manual Capture input. An eligible
  replacement starts a new attempt.
- Title and Type begin unowned by the User. The first actual User mutation,
  including clearing a value, makes that field User-owned for the lifetime of
  the open Capture. Focusing without changing it does not. Inspection, retry,
  and Source replacement never overwrite a User-owned field.
- Retry is offered only after an unavailable result. It starts one new attempt
  for the current Source, performs no hidden automatic retry, and preserves
  User-owned fields. Partial success offers no Retry.
- Add to Library remains enabled whenever required title and Type values are
  present, including while inspection is running. Adding cancels outstanding
  inspection, ignores its later response, and persists only the current title,
  Type, and exact Source. The Add action confirms untouched suggestions as well
  as User-entered values; suggestion evidence and provenance are discarded.

## Evidence rules

For a generic public page, title preference is a single primary recognized
Schema.org entity, then Open Graph title, then the HTML document title. Type is
suggested only by an unambiguous supported Provider route or strong, agreeing
primary Schema.org or narrow Open Graph evidence. Conflicting strong evidence
leaves Type unresolved; titles, paths, hostnames, generic containers, and model
guesses never determine Type.

YouTube is classified by resource shape rather than hostname. Recognized videos
may suggest their canonical title and Type _video_; playlists may suggest their
canonical title and Type _playlist_. A recognized direct Community Post Source
suggests Type _other_, leaves title unresolved, and performs no Post-page fetch.
Ambiguous and unsupported YouTube routes leave both fields unresolved. A video
description is not a substitute title.

The product deliberately allows a confirmed YouTube oEmbed video or playlist
title to become the ordinary durable Item title without a refreshable
Provider-metadata projection. It accepts that no adequate current first-party
YouTube retention contract for oEmbed was found; this is an explicit product
risk, not a claim of compliance. The YouTube Data API is excluded because its
title retention duties conflict with the no-projection boundary, and YouTube
page extraction is excluded because of its automated-access and drift risk.
[ADR-0021](./0021-source-inspection-is-stateless-and-guarded.md) owns the
production mechanism, safety boundary, and kill switch.

## Consequences

Source inspection is not Import, recurring Discovery, deduplication, or sync.
It stores no redirect target, fetched body, evidence, failure detail, Provider
projection, or refresh schedule. Failure, an unsupported Source, a title-only
offline Item, and a manually completed web Item all converge on the same explicit
Capture confirmation and the same durable Item shape.
