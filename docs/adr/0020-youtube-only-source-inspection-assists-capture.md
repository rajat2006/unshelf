# YouTube-only Source inspection assists one uniform Capture

Capture may inspect an eligible YouTube video or playlist Source once to suggest
an editable title and Type before the User explicitly adds the Item to the
Library. We accept this narrow, ephemeral assistance because it removes routine
transcription for common YouTube Capture while preserving the deeper boundary:
manual and offline Capture remain complete, Source stays exact, and inspection
creates neither an Item nor durable metadata.

## Eligibility

- Source is the first field in the existing stable Capture form. Every Source
  mutation, including paste, resets one 300 ms debounce.
- Inspection accepts absolute HTTP(S) Sources only on `youtube.com`,
  `www.youtube.com`, `m.youtube.com`, and `youtu.be`.
- Eligible videos are `/watch?v=<video-id>`, `/shorts/<video-id>`, and
  `youtu.be/<video-id>`. Eligible playlists are
  `/playlist?list=<playlist-id>`. Harmless share, tracking, timestamp, and
  fragment parameters may accompany one unambiguous identity.
- Duplicate or malformed identifiers, mixed video-and-playlist identity,
  credentials, explicit ports, embeds, Community Posts, live links, channels,
  handles, search, home, other routes, other YouTube properties, and every
  non-YouTube Source remain fully manual and cause no inspection network request.

## Suggestions and User ownership

- A supported video may suggest Type _video_; a supported playlist may suggest
  Type _playlist_. Type comes from conservative local route classification.
- Title comes only from one bounded YouTube oEmbed attempt using a canonical URL
  reconstructed from the validated identifier. Canonicalization is acquisition
  only and never rewrites the User's Source.
- Suggestions populate the ordinary title and Type fields and carry a textual
  **Suggested** marker. They are current field values, not alternatives requiring
  a second accept action.
- Title and Type each begin unowned. The first actual User mutation, including
  clearing, makes that field User-owned for the lifetime of the open Capture;
  focus and blur do not. Inspection never overwrites a User-owned field.
- Changing Source cancels obsolete work, clears only untouched suggestions from
  the previous Source, and preserves User-owned values. Add, close, and unmount
  cancel and invalidate outstanding work. Only the current Source revision may
  alter the form, so late or out-of-order responses have no effect.
- An eligible attempt leaves its checking state within three seconds. An absent
  title, failed oEmbed attempt, or disabled title lookup retains any local Type
  suggestion and returns quietly to manual title entry. There is no automatic or
  manual Retry.

## Visible lifecycle and confirmation

Manual-only Sources remain idle: no failure treatment or announcement. An
eligible attempt uses one persistent polite status region to announce a quiet
checking transition and then either suggested YouTube details, a suggested Type
with manual title entry, or preservation of the User's entries. Suggested meaning
is textual rather than color-only, and motion is never required. Cancellation and
supersession are invisible.

Add to Library remains available whenever title and Type are complete, including
while title acquisition is active. It is the only confirmation, accepts untouched
suggestions as the current values, invalidates outstanding inspection, and stores
only the current title, confirmed Type, and Source exactly as entered. Inspection
creates no evidence record, Provider identity, metadata projection, cache,
refresh, sync, deduplication rule, or recurring Discovery relationship.

Generic public-page inspection and every excluded YouTube shape must earn a fresh
design rather than extending this contract speculatively.
