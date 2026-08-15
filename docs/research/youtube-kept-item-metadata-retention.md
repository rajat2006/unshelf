# YouTube API retention after Keep

Research memo for [Research YouTube retention for metadata copied into kept
Items](https://github.com/rajat2006/unshelf/issues/397), within
[Wayfinder: design the provider-extensible Discover
room](https://github.com/rajat2006/unshelf/issues/379).

Researched: 2026-08-15

## Executive finding

**Keep does not create a retention exception.** In the selected first slice,
Unshelf reads public YouTube data with a system API key and no YouTube User
Credentials. The resulting video ID and metadata are therefore Non-Authorized
API Data. Copying them from a Candidate into an Item, calling the copy a
snapshot, recording the User's Keep decision, or adding independent Unshelf
functionality does not have any stated effect on that classification.

The current policy permits limited Non-Authorized Data to be stored for no more
than 30 calendar days before it is deleted or refreshed. It also requires
reasonable efforts to keep stored API Data consistent with current YouTube data
and current data in user-facing presentations. The permission to display
historical API Data accurately in time context does **not expressly override**
the 30-day storage limit. ([Developer Policies, section
III.E](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content))

Consequently, no automatically copied YouTube-origin value can be treated as an
immutable, indefinitely retained Item snapshot on the published text alone.
Successful revalidation may keep an unchanged value for another bounded period.
If a value changes, the current YouTube projection must change; if it cannot be
refreshed by its deadline, it must be removed. Neither outcome may silently
rewrite a User-owned Item.

The conservative product rule is therefore:

> Keep may durably create the Item, the Candidate-to-Item link, the Keep event,
> and independently User-supplied Item fields. It must not copy any API-returned
> or API-derived YouTube value into an immutable Item field. All YouTube-origin
> values live in a separate, provenance-marked projection, expire no later than
> 30 calendar days after successful retrieval, and are replaced from a
> successful refresh or deleted. A refresh updates only that projection, never
> the User-owned Item. Automatic snapshot copying remains blocked until YouTube
> confirms it in writing.

For an unblocked first slice, Keep must obtain a non-prefilled, independently
User-supplied Item title and Type; Source remains optional and may be stored only
when independently supplied by the User. Merely confirming or adopting
API-prefilled values is not assumed to change their provenance. Omit the
description excerpt entirely pending clarification of YouTube's derived-data
rule.

This is a conservative product-policy interpretation, not legal advice. YouTube
can give the authoritative application-specific answer through its compliance
audit.

## Governing policy

### The first-slice data is Non-Authorized API Data

YouTube defines API Data broadly as data, content, and information provided to
an API Client through YouTube API services. It defines Non-Authorized Data as API
Data accessible without User Credentials, while Authorized Data requires an
active user to authorize access or use **via User Credentials**. ([API Data
definition](https://developers.google.com/youtube/terms/developer-policies#definition-api-data),
[Non-Authorized Data
definition](https://developers.google.com/youtube/terms/developer-policies#definition-non-authorized-data),
[Authorized Data
definition](https://developers.google.com/youtube/terms/developer-policies#definition-authorized-data))

[Choose the first-slice Provider and Follow
contract](https://github.com/rajat2006/unshelf/issues/387#issuecomment-5301693939)
settled a system-held application key with no User Google authorization. An
Unshelf User's Keep is an Unshelf action, not authorization with YouTube User
Credentials. The video ID and every value obtained from the public video
resource therefore remain Non-Authorized API Data after Keep.

Even adding OAuth later would not create a general immutable-metadata exception.
Outside the special Analytics, Reporting, and authorized-statistics cases,
section III.E.4.c still limits other Authorized Data to 30 days before deletion
or refresh. ([Developer Policies, section
III.E.4](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content))

### The duties are cumulative

For Non-Authorized Data, section III.E.4.d permits only limited temporary storage
for the API Client's purpose and no longer than 30 calendar days; after that the
Client must delete or refresh it. Sections III.E.4.e and III.E.4.f separately
require reasonable efforts to keep stored API Data consistent with current
YouTube data and to display the most updated data in user-facing presentations.
Historical API Data may be displayed when accurately presented in time context.
([Developer Policies, section
III.E.4](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content))

The text gives no hierarchy in which historical presentation cancels the storage
limit. The conservative reading is that historical display is available only
for API Data otherwise lawfully retained—for example, a still-within-30-days
snapshot—or under an applicable written allowance. Keeping an old value while
refreshing a second, current value does not refresh the old stored value.

The June 2026 additional-storage policy reinforces that reading. Audited,
accepted analytics clients may retain specified statistics for up to 36 months,
but YouTube explicitly says other data such as video titles, creator names,
descriptions, and comment text still follow the 30-day refresh/deletion policy.
([Additional policies for derived metrics and data storage: Data
Storage](https://developers.google.com/youtube/terms/derived-metrics-policy#data-storage),
[current audit and quota extension
form](https://support.google.com/youtube/contact/yt_api_form))

### Independent value is a separate obligation, not an exception

YouTube prohibits an API Client from substituting for or replicating a YouTube
experience unless it adds significant independent value. The compliance guide
similarly explains that an API service must add sufficient independent value.
([Developer Policies, section
III.I](https://developers.google.com/youtube/terms/developer-policies#i.-additional-prohibitions),
[compliance guide: independent
value](https://developers.google.com/youtube/terms/developer-policies-guide#your_api_service_must_add_sufficient_independent_value))

Unshelf's Library, learning organization, and User-owned progress are plausible
independent value; that is an inference, not an approval. Neither source says
independent value reclassifies API Data or waives section III.E. Unshelf must
satisfy both requirements.

### Termination is stricter than the rolling refresh rule

On suspension, discontinuance, or termination, the Terms require immediate
cessation of access/use and deletion of all API Data in the Client's possession
or control. ([YouTube API Services Terms, section
24.3](https://developers.google.com/youtube/terms/api-services-terms-of-service#termination))
The architecture therefore needs a provenance-complete YouTube purge path; an
Item copy cannot be allowed to hide API Data from it.

## Field-by-field retention result

The video resource directly returns the video ID, publication time, title,
description, thumbnail URLs, and channel title. It also identifies the resource
kind as a YouTube video. ([video resource
representation](https://developers.google.com/youtube/v3/docs/videos#resource-representation))

| Candidate-to-Item field | Provenance | Conservative retention status | Required product treatment |
| --- | --- | --- | --- |
| **Provider identity: Provider namespace** | The configured Unshelf value “youtube” is a product-owned namespace, not a value returned by the API. | May remain durable. | Keep the Provider namespace and internal Candidate/Item IDs as Unshelf data. Do not call the combined Provider identity durable if its video-ID component has been removed. |
| **Provider identity: video ID** | The API says video.id is the ID YouTube uses to uniquely identify a video. ([video.id](https://developers.google.com/youtube/v3/docs/videos#id)) | Non-Authorized API Data: refresh or delete within 30 days. It may stay unchanged across successful refreshes, but it is not an exception to the cadence. | Store it only in the YouTube projection. Revalidate it before expiry. If the video cannot be refreshed by the deadline, remove the ID while retaining internal Candidate, Discovery, Keep, and Item records. |
| **Title** | Direct snippet.title API Data. ([snippet.title](https://developers.google.com/youtube/v3/docs/videos#snippet.title)) | Refresh or delete within 30 days; reflect known changes promptly in current YouTube presentation. | Never silently apply a changed YouTube title to the Item. Show current title from the YouTube projection. A durable Item title must be independently supplied by the User, not automatically copied or merely accepted as a prefill without written clarification. |
| **Source** | The settled canonical watch URL is constructed from the API-returned video ID rather than returned as a field. | At minimum, its embedded video ID remains API Data. Whether constructing and retaining the watch URL is separately permissible under the derived-data rule is not explicit. Treat the automatic Source as API-derived and subject to refresh/deletion pending clarification. | Keep the current watch link in the YouTube projection. A durable Item Source must be independently supplied by the User; do not treat clicking Keep as independent supply. |
| **Publisher** | Direct snippet.channelTitle API Data. ([snippet.channelTitle](https://developers.google.com/youtube/v3/docs/videos#snippet.channelTitle)) | Refresh or delete within 30 days. | Keep only in the YouTube projection; update or remove there without changing User-owned Item fields. |
| **Publication time** | Direct snippet.publishedAt API Data. ([snippet.publishedAt](https://developers.google.com/youtube/v3/docs/videos#snippet.publishedAt)) | Refresh or delete within 30 days, even though it usually behaves like a stable fact. | Keep only in the YouTube projection. Do not infer durability from factual or historical character. |
| **Type** | The API resource kind identifies a video, and the Provider adapter maps it into Unshelf Type “video”. ([video.kind](https://developers.google.com/youtube/v3/docs/videos#kind)) | An automatically mapped Type is derived from API Data; conservatively keep it on the same 30-day cadence. An independently User-selected Unshelf Type is product/User data, provided it is clearly presented as Unshelf's own field. | Require the User to choose the Item Type independently. When shown beside YouTube data, make clear it is an Unshelf field, as section III.E.4.h requires for non-YouTube information displayed alongside API Data. |
| **Thumbnail URL** | Direct snippet.thumbnails.*.url API Data. ([thumbnail URL](https://developers.google.com/youtube/v3/docs/videos#snippet.thumbnails.%28key%29.url)) | Refresh or delete within 30 days. A remote URL rather than stored bytes does not change its API provenance. | Keep only in the YouTube projection. On expiry or removal, show an Unshelf-owned placeholder. |
| **Bounded description excerpt** | A truncation/transformation of direct snippet.description API Data. ([snippet.description](https://developers.google.com/youtube/v3/docs/videos#snippet.description)) | The source description is subject to the 30-day rule. In addition, section III.E.4.h prohibits using API Data to create new or derived data or metrics; the published text does not clearly authorize this truncation. | Omit the excerpt from the first slice. If YouTube approves an excerpt, keep it in the projection and refresh/delete it on the same cadence; approval to transform it must not be assumed to waive retention. |

The table distinguishes values by **provenance**, not by column name. If a User
independently types an Item title, chooses Type, or supplies a Source, that input
was not provided to Unshelf through the YouTube API and may remain User-owned.
This is an inference from YouTube's API Data definition. It does not justify
automatically prepopulating an API value and relabeling the stored copy as User
data.

## Why the proposed exceptions do not work

### “As kept on” historical context

An “as kept on 2026-08-15” label would satisfy the time-context condition for a
historical presentation, but the policy never says that label extends how long
Non-Authorized Data may be stored. It is therefore useful presentation metadata
only while the underlying historical value is otherwise retainable. Retention
beyond 30 days on this theory requires a written YouTube answer.

### The User chose Keep

Keep is durable Unshelf product data: the User's decision, its time, the internal
Candidate-to-Item relationship, Item Status, Labels, and Learning Plan placement
can remain. But the Authorized Data definition specifically hinges on
authorization via YouTube User Credentials. The local Keep action cannot be used
as a substitute.

Whether a User's explicit confirmation or adoption of API-prefilled Item fields
turns those values into independently User-supplied data is **not answered** by
the policies. The implementation must not assume that it does.

### Unshelf adds independent product value

Independent value can help establish that Unshelf is not a YouTube clone.
It does not alter the storage, freshness, attribution, derived-data, or
termination rules. Product value also cannot “launder” a video ID or metadata
copy into non-API data.

## Exact architecture and handoff constraint

The production architecture and implementation handoff should include this
normative constraint:

> Model every YouTube-origin value as a field-level, purgeable YouTube projection
> with fetchedAt, expiresAt no later than fetchedAt plus 30 calendar days, and
> source provenance. A successful refresh must retrieve and reconcile current
> values; it must not merely advance expiresAt. Current values replace the
> projection, never User-owned Item fields. If refresh is unsuccessful or a value
> is unavailable at expiry, delete that value and suppress its presentation.
> Expiry deletion must happen by the deadline even when the User does not open
> Unshelf; a local expiry/cleanup mechanism is required and is not Provider
> polling.
> Preserve only the configured Provider namespace, internal IDs, User-owned
> lifecycle facts for Follows, Candidates, Discoveries, Keep/Dismiss history,
> the Candidate-to-Item link, and independently User-supplied Item fields;
> Provider-owned Follow target and display values remain governed by their own
> provenance and retention rules. Keep must not automatically copy the
> video ID, title, constructed watch Source, publisher, publication time,
> Provider-derived Type, thumbnail URL, or description excerpt into immutable
> Item storage. It must obtain a non-prefilled User title and Type, and optional
> independently supplied Source. Omit the excerpt. Provide a single operation
> that purges every YouTube-origin value on API termination. Ship automatic
> snapshot copying only after a written YouTube approval names the permitted
> fields, duration, refresh behavior, historical presentation, and deletion
> triggers.

This preserves the settled rule from [Define the lifecycle from recurring
discovery to an
Item](https://github.com/rajat2006/unshelf/issues/266#issuecomment-5226169495):
later Provider changes never silently change the Item. Provider changes instead
change only the visibly distinct current YouTube projection. The cost is that
the earlier “Keep creates from a Candidate snapshot” rule must be narrowed for
YouTube until the compliance question is answered.

It also sharpens the prior research statement that “Unshelf-owned lifecycle and
provenance” includes Candidate identity. That statement should mean the internal
Candidate identity, configured Provider namespace, lifecycle facts, and
relationships—not an API-returned video ID. ([prior research
memo](https://github.com/rajat2006/unshelf/blob/24bafec4b9a0f09f0b3aaada4315547486a6146b/docs/research/discover-provider-access-and-candidate-identity.md#refresh-retention-and-failure-semantics))

## Written clarification required

Submit this exact question through the [YouTube API Compliance Audit
form](https://support.google.com/youtube/contact/yt_api_form):

> Unshelf uses the public YouTube Data API with an application API key and no
> end-user Google OAuth. When an Unshelf user clicks Keep, may Unshelf retain
> beyond 30 calendar days an immutable, time-labelled “as kept” Item snapshot
> containing the YouTube video ID, API title, a watch URL constructed from the
> video ID, channel title, publishedAt, an Unshelf “video” Type derived from the
> video resource, thumbnail URL, and a truncated description, while separately
> refreshing and displaying current YouTube API Data? Does the user's explicit
> confirmation/adoption of API-prefilled fields make any named field
> independently user-supplied rather than API Data? If III.E.4.f permits that
> historical retention despite III.E.4.d, which fields, maximum duration,
> attribution, refresh, video-removal, API-termination, and deletion obligations
> apply? Separately, is a bounded truncation of snippet.description permitted
> under III.E.4.h? Please answer field by field in writing.

Until YouTube answers affirmatively, the constraint above is the release gate.
The compliance guide itself directs developers who remain unsure after reading
the policies to apply for an audit. ([Complying with YouTube's Developer
Policies](https://developers.google.com/youtube/terms/developer-policies-guide))
YouTube also reserves the right to monitor and audit API Clients for compliance.
([Developer Policies, section
III.H](https://developers.google.com/youtube/terms/developer-policies#h.-monitoring-and-audits))

## Evidence limits

- This memo interprets the published Agreement and first-party compliance
  material as of 2026-08-15. The Developer Policies page says it was last updated
  2026-06-24 UTC.
- No written YouTube interpretation or completed audit for Unshelf was available.
- No source says that copying API Data between Unshelf records, the local Keep
  action, historical labelling, or independent product value changes API
  provenance. Absence of such text supports the conservative constraint but is
  not an affirmative YouTube ruling.
- The permission for independently User-supplied Item fields is a
  definition-based inference. Whether confirmation of a displayed prefill is
  independent supply is intentionally left to YouTube.

## Primary-source inventory

- YouTube: [API Services Developer
  Policies](https://developers.google.com/youtube/terms/developer-policies)
- YouTube: [API Services Terms of
  Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- YouTube: [Complying with YouTube's Developer
  Policies](https://developers.google.com/youtube/terms/developer-policies-guide)
- YouTube: [Additional policies for derived metrics and data
  storage](https://developers.google.com/youtube/terms/derived-metrics-policy)
- Google/YouTube: [API Compliance Audit and Quota Extension
  Form](https://support.google.com/youtube/contact/yt_api_form)
- YouTube Data API: [Video
  resource](https://developers.google.com/youtube/v3/docs/videos)
