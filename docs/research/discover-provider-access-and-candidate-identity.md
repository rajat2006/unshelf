# Discover Provider Access and Stable Candidate Identity

Research memo for [Research Provider access and stable Candidate identity](https://github.com/rajat2006/unshelf/issues/382), within [Wayfinder: design the provider-extensible Discover room](https://github.com/rajat2006/unshelf/issues/379).

Researched: 2026-08-15

## Executive finding

Unshelf does not need an AI agent to acquire the first useful set of Discover sources. Every supportable path in this review has a deterministic interface: an official API for [YouTube](https://developers.google.com/youtube/v3/docs), [Gmail](https://developers.google.com/workspace/gmail/api/reference/rest), [X](https://docs.x.com/x-api), and [daily.dev](https://docs.daily.dev/public-api/); [RSS](https://www.rssboard.org/rss-specification) or [Atom](https://www.rfc-editor.org/rfc/rfc4287) for feed-capable publications and [public Substack publications](https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication); and standards-based feed discovery or site-specific HTML extraction for websites that do not advertise a feed. An agent may later help recover structured fields from irregular pages, but it cannot make an unsupported access path stable or permitted.

The recommended provider order is:

1. **Ship public YouTube first.** Channel uploads and public playlists have low-cost first-party API paths. Saved queries are technically available but have a much tighter quota and should be treated as a separately budgeted target kind.
2. **Add RSS/Atom next.** It is the broadest low-friction path for public engineering blogs and also covers public Substack publications. A publication is a Follow target or publisher; RSS is the Provider adapter.
3. **Use website extraction only as an explicit, site-compatible fallback.** A sitemap can reveal URLs, but it does not supply the full Candidate contract. HTML extraction also has weaker identity and higher breakage risk than a feed.
4. **Defer mailbox email, X, and daily.dev behind provider-specific decisions.** Gmail access is privacy- and verification-heavy; X is metered, policy-constrained, and has a seven-day recent-search boundary; daily.dev exposes a good API but requires a paid user plan and a manually managed personal token.

Stable Candidate identity must be exact and provider-namespaced, matching the domain decision in [Define the lifecycle from recurring discovery to an Item](https://github.com/rajat2006/unshelf/issues/266). A canonical URL is the Candidate's **Source**, not its universal identity. Different providers can surface the same URL without proving that their records are the same Candidate. Cross-provider deduplication is a later concern.

## Scope and method

This memo evaluates the current first-party access path, Follow target kinds, minimum Candidate metadata, stable identity, authentication, quota, privacy, terms, and operational constraints for:

- YouTube;
- RSS/Atom and public engineering websites;
- email newsletters, using Gmail as the concrete mailbox API;
- Substack;
- X; and
- daily.dev.

Read it with [Reliable Candidate metadata acquisition and agent-assisted extraction](./candidate-metadata-acquisition-hierarchy.md), which defines the cross-Provider capability ladder, validation, drift detection, browser isolation, and the narrow safe boundary for model assistance. This memo specializes that work with concrete Provider access and identity decisions.

Only official documentation, standards, and directly inspected first-party feeds or pages are used for product, API, and policy facts. No paid credentials were provisioned and no authenticated endpoint was exercised. Exact X endpoint prices are not published on its [public pricing page](https://docs.x.com/x-api/getting-started/pricing); they are shown in the Developer Console, so this memo does not estimate them. Website extraction feasibility was evaluated at the interface level, not as an exhaustive audit of individual publishers' terms.

## Access and viability matrix

| Provider path | Useful Follow targets | First-party access and auth | One-month initial lookback | Stable provider reference | Candidate metadata available | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **YouTube Data API** | Channel uploads, public playlist, saved search query | Public reads use an application API key; private user data requires OAuth. A channel's uploads playlist is exposed by `channels.list`, and its videos by `playlistItems.list`. ([authentication](https://developers.google.com/youtube/documentation/authentication), [channel resource](https://developers.google.com/youtube/v3/docs/channels), [playlist items](https://developers.google.com/youtube/v3/docs/playlistItems/list)) | `search.list` supports `publishedAfter`, and upload/playlist results can be paged and filtered locally by publication time. A channel-scoped video search can return at most 500 videos. ([search](https://developers.google.com/youtube/v3/docs/search/list)) | YouTube video `id`, which the API defines as the identifier YouTube uses to identify the video. ([video resource](https://developers.google.com/youtube/v3/docs/videos)) | Title, description, channel ID/title, publication time, thumbnails, and canonical watch Source can be derived from the video ID. ([video resource](https://developers.google.com/youtube/v3/docs/videos)) | **First slice.** Prefer uploads playlists and explicit playlists. Admit query Follows only with a quota budget and clear result semantics. |
| **RSS/Atom** | Feed URL discovered or entered directly; publication/category represented by that feed | Public HTTP fetch; feed autodiscovery is advertised with an HTML `link` whose relationship is `alternate` and whose type is RSS or Atom. ([HTML link types](https://html.spec.whatwg.org/multipage/links.html#link-type-alternate), [WHATWG feed autodiscovery note](https://blog.whatwg.org/feed-autodiscovery)) | Only if the feed retains entries spanning the month; RSS and Atom do not require a particular history window. ([RSS 2.0 items](https://www.rssboard.org/rss-specification#hrelementsOfLtitemgt), [Atom entries](https://www.rfc-editor.org/rfc/rfc4287#section-4.1.2)) | Atom `atom:id`; RSS `guid`, else a link only under a feed-specific validated permalink contract. Reject feeds whose items expose neither stable form. Atom IDs are permanent and globally unique; RSS GUID is optional and has no mandated syntax. ([Atom ID](https://www.rfc-editor.org/rfc/rfc4287#section-4.2.6), [RSS GUID](https://www.rssboard.org/rss-specification#ltguidgtSubelementOfLtitemgt)) | Atom requires entry ID, title, and updated time and can include link, published time, author, and summary. RSS requires title or description and can include link, author, category, publication date, and GUID. ([Atom entry](https://www.rfc-editor.org/rfc/rfc4287#section-4.1.2), [RSS item](https://www.rssboard.org/rss-specification#hrelementsOfLtitemgt)) | **Second provider.** Broad, public, low-auth, and provider-extensible. Report incomplete lookback when feed history is shorter than one month. |
| **Website HTML / sitemap** | Site or category URL | Public HTTP or rendered browser only where site terms and access controls permit it. A sitemap requires a URL and may include last-modified time, but it does not carry title, author, excerpt, or content type. ([Sitemaps protocol](https://www.sitemaps.org/protocol.html)) | Site-dependent; an index/category page may not retain one month, while a sitemap can enumerate older URLs without enough display metadata. ([Sitemaps protocol](https://www.sitemaps.org/protocol.html)) | Prefer a publisher-supplied canonical URL after URL normalization; stability is weaker than a provider-issued entry ID. This is an inference from the sitemap's URL-only identity and the absence of a mandated entry identifier. ([Sitemaps protocol](https://www.sitemaps.org/protocol.html)) | Must be extracted from page-specific metadata or markup; a sitemap alone is insufficient. | **Fallback only.** Maintain an allowlisted adapter per compatible site, validation fixtures, and a visible degraded/error state. Do not make arbitrary-page agent browsing the base Provider contract. |
| **Gmail API** | User-selected label, sender, list identifier, or query; alternatively a dedicated forwarded inbox outside Gmail | OAuth is required. `gmail.metadata` exposes headers and labels but cannot use the API's `q` parameter; `gmail.readonly` permits message reads and search. Both are restricted scopes. ([message listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)) | A `messages.list` search can use Gmail search syntax, followed by `messages.get`; list results contain only message and thread IDs. ([message listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [message retrieval](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)) | Gmail account plus immutable Gmail message `id`. A dedicated inbound service should likewise use its immutable delivery ID; RFC `Message-ID` is useful secondary evidence but is optional. ([Gmail Message](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages), [RFC 5322 identifiers](https://www.rfc-editor.org/rfc/rfc5322#section-3.6.4)) | Headers give sender, subject, and date; Gmail also exposes an API-generated snippet, internal received time, labels, and parsed MIME payload. A canonical article URL generally requires transient body parsing because email headers do not define one. ([Gmail Message](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages), [RFC 5322 fields](https://www.rfc-editor.org/rfc/rfc5322#section-3.6)) | **Feasible, but decide the intake model first.** A dedicated forwarding address minimizes mailbox scope; Gmail OAuth offers richer user-side selection but carries restricted-scope review and privacy costs. |
| **Substack public publication** | Publication feed URL, normally `publication.substack.com/feed` | Substack documents RSS for each publication. Its public Developer API terms currently enumerate profile/publication metadata as Authorized Data, not post records. ([Substack RSS](https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication), [Developer API terms](https://substack.com/api-tos)) | Subject to the publication feed's retained history, as for other RSS feeds. ([Substack RSS](https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication)) | RSS GUID or link under the RSS Provider namespace. | The public feed supplies the RSS item fields the publication emits. | **Model as RSS, not a separate Provider.** Paid/private text newsletters should arrive through the chosen email path; Substack documents unique private feeds for podcasts, not a general private-post RSS interface. ([private podcast RSS](https://support.substack.com/hc/en-us/articles/4519588148244-How-do-I-listen-to-episodes-on-my-podcast-app)) |
| **X API** | Public account timeline; saved post query | App-only bearer auth can read public information. User-context OAuth is required only for user-private or user-authorized operations. ([app-only auth](https://docs.x.com/fundamentals/authentication/oauth-2-0/application-only)) | Account timelines return up to the most recent 3,200 posts and accept time bounds. Recent search covers only the last seven days; full-archive search covers posts since 2006 and is a different paid access path. ([timelines](https://docs.x.com/x-api/posts/timelines/introduction), [search](https://docs.x.com/x-api/posts/search/introduction)) | The oldest ID in `edit_history_tweet_ids`, because each edit creates a new Post ID and the edit history is ordered from oldest to newest. ([edit history](https://docs.x.com/x-api/fundamentals/edit-posts), [Post fields](https://docs.x.com/x-api/fundamentals/data-dictionary)) | Post text and ID are default fields; created time, author, entities, attachments, media, and user data require requested fields or expansions. X Posts do not define a title field. ([Post fields](https://docs.x.com/x-api/fundamentals/data-dictionary)) | **Later, official API only.** Account Follows fit one-month lookback; query Follows require full archive for the agreed month. Pricing is pay-per-use and exact endpoint rates are shown in the Developer Console. ([pricing](https://docs.x.com/x-api/getting-started/pricing)) |
| **daily.dev Public API** | Source, tag, search, custom feed, or personalized feed | Bearer personal-access token; daily.dev requires an active Plus subscription to create one. ([Public API](https://docs.daily.dev/public-api/)) | Post search exposes `time=month`; source and tag feeds are cursor-paginated. ([OpenAPI document](https://api.daily.dev/public/v1/docs/json)) | daily.dev post `id`. ([OpenAPI document](https://api.daily.dev/public/v1/docs/json)) | ID, title, direct URL, image, nullable summary and publication time, content type, source, tags, reading time, and engagement fields. ([OpenAPI document](https://api.daily.dev/public/v1/docs/json)) | **Good technical probe, but terms clarification is required.** The API is well shaped for Candidate ingestion, but each User must pay for Plus and manage a personal token; daily.dev's general terms grant personal internal use and restrict commercial exploitation. ([Public API](https://docs.daily.dev/public-api/), [Terms](https://daily.dev/tos)) |

## Recommended first-slice contracts

### Provider, target, and Candidate are different things

The domain's **Provider** is the adapter and identity authority: `youtube`, `rss`, `gmail`, `x`, or `dailydev`. The **Follow target** is provider-owned configuration: a YouTube channel or playlist, an RSS feed URL, a Gmail label/query/sender, an X account/query, or a daily.dev source/tag/query. The publisher is descriptive metadata, not necessarily a Provider. OpenAI, Anthropic, a Substack publication, an X account, and a daily.dev `source` are therefore publishers or targets behind their respective adapters.

This distinction prevents an integration-shaped taxonomy from leaking into the shared domain. It also means a Substack publication reached through its documented feed is an RSS Follow, while the same publisher reached through forwarded mail is an email Follow. The two provider identities are not automatically equal.

Follow targets also need provider-owned stable keys; a display name is not enough:

| Provider | Target kind | Persisted target key |
| --- | --- | --- |
| YouTube | Channel uploads | Channel `id`, plus its resolved uploads playlist ID. YouTube identifies both channels and playlists by resource IDs. ([channel resource](https://developers.google.com/youtube/v3/docs/channels), [playlist resource](https://developers.google.com/youtube/v3/docs/playlists)) |
| YouTube | Public playlist | Playlist `id`. |
| YouTube | Saved query | Versioned normalized query/filter configuration, including result type, publication policy, and any channel scope; a query has no upstream resource ID. ([search parameters](https://developers.google.com/youtube/v3/docs/search/list)) |
| Atom/RSS | Feed | Configured feed URL plus redirect history; use Atom's required feed-level ID as additional continuity evidence when available. RSS has no equivalent required channel ID. ([Atom feed requirements](https://www.rfc-editor.org/rfc/rfc4287#section-4.1.1), [RSS channel requirements](https://www.rssboard.org/rss-specification#requiredChannelElements)) |
| Gmail | Label, sender/list, or query | Provider account ID plus Gmail label ID, normalized address/list identifier, or versioned exact query. Gmail's Label resource has an immutable ID. ([Gmail Label](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels)) |
| X | Account | X User ID rather than the username display value. The User object exposes both `id` and `username`; the resource ID is the Provider key. ([User fields](https://docs.x.com/x-api/fundamentals/data-dictionary)) |
| X | Query | Versioned exact query and selected search access tier. The recent and full-archive endpoints accept the same query language but expose different time windows. ([search](https://docs.x.com/x-api/posts/search/introduction)) |
| daily.dev | Source, tag, or query | Source ID where supplied; otherwise the exact tag or versioned normalized search configuration. ([OpenAPI document](https://api.daily.dev/public/v1/docs/json)) |

Target display metadata such as channel name, publication name, sender name, X username, or daily.dev source handle may be refreshed without changing the Follow's target key.

### Required normalized Candidate metadata

The existing Candidate-to-Item decision requires a title, Type, Source, and provider identity when Keep creates an Item ([resolution](https://github.com/rajat2006/unshelf/issues/266#issuecomment-5226169495)). A Provider result should therefore normalize to:

| Field | Contract |
| --- | --- |
| `providerKind` | Stable adapter name, such as `youtube` or `rss`. |
| `providerReference` | Opaque, stable identity interpreted only by that Provider. Namespace it by provider account or feed where the upstream ID is not globally unique. |
| `source` | User-openable canonical URL. It is not the general deduplication key. |
| `title` | Provider title when available. Provider-specific deterministic derivation is required where the source has no title, notably X Posts and some email. |
| `type` | Mapping into Unshelf's current Item Type vocabulary; the mapping belongs to the adapter and must be explicit. |
| `publishedAt` | Provider publication/received timestamp when available; nullable where the provider does not supply one. |
| `firstSeenAt` | Unshelf-owned observation timestamp. Never substitute it for a missing Provider publication time. |
| `publisher` | Display attribution such as YouTube channel, feed title/author, mail sender, X user, or daily.dev source. |
| `summary` | Optional provider excerpt/snippet; never require full content storage. |
| `thumbnail` | Optional remote image reference where provider display rules permit it. |

Only normalized metadata and provider identifiers need durable storage. HTML, email bodies, or API payloads may be processed transiently and discarded. This satisfies the map's metadata-only direction while preserving enough provenance to re-fetch or open the source.

### Identity rules

| Adapter | Exact `providerReference` rule | Important edge case |
| --- | --- | --- |
| YouTube | `video:<videoId>` | One video found through several channel, playlist, or query Follows is one Candidate, with several Discoveries. |
| Atom | `feed:<normalizedFeedUrl>:atom:<atomId>` | Atom says an ID must not change when an entry relocates, so do not replace it with the current URL. ([Atom ID](https://www.rfc-editor.org/rfc/rfc4287#section-4.2.6)) |
| RSS | `feed:<normalizedFeedUrl>:guid:<guid>`; use `link:<normalizedItemUrl>` only under a feed-specific validated permalink contract | RSS GUID is optional and may or may not be a permalink. If neither accepted form is available, fail that entry rather than invent identity from mutable title/date text. ([RSS GUID](https://www.rssboard.org/rss-specification#ltguidgtSubelementOfLtitemgt)) |
| Gmail | `account:<providerAccountId>:message:<gmailMessageId>` | Gmail's message ID is immutable, but the same delivered email in another mailbox has a different mailbox-native identity. ([Gmail Message](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)) |
| Dedicated inbound email | `inbox:<inboxId>:delivery:<providerDeliveryId>` | Keep RFC `Message-ID` as secondary evidence only: it is optional, though a generator should make it globally unique when present. ([RFC 5322](https://www.rfc-editor.org/rfc/rfc5322#section-3.6.4)) |
| X | `post:<oldestEditHistoryId>` | Each edit has a new Post ID; using the current ID would create a new Candidate after an edit. ([edit history](https://docs.x.com/x-api/fundamentals/edit-posts)) |
| daily.dev | `post:<dailyDevPostId>` | An article found independently through RSS is still a different provider identity; exact cross-provider equivalence is not established by a shared URL. |

Provider references should be immutable after Candidate creation. If a provider adapter later learns a better canonical Source, title, or image, that does not change Candidate identity. The existing lifecycle decision already says that a kept Item snapshots Candidate metadata rather than silently following future provider changes ([resolution](https://github.com/rajat2006/unshelf/issues/266#issuecomment-5226169495)).

## Provider-specific findings

### YouTube: split cheap collection targets from expensive query targets

`channels.list` exposes a channel's uploads playlist and costs one quota unit; `playlistItems.list` also costs one unit per call. `search.list` supports query, date ordering, publication bounds, channel scope, and video-only results, but the current quota guide limits a project to 100 `search.list` calls per day by default, separate from 10,000 combined units for other endpoints. ([channels.list](https://developers.google.com/youtube/v3/docs/channels/list), [playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list), [search.list](https://developers.google.com/youtube/v3/docs/search/list), [quota overview](https://developers.google.com/youtube/v3/getting-started#quota))

This makes channel and playlist Follows operationally different from a recurring query. On app-open/manual refresh, Unshelf can store the channel's uploads playlist ID once, fetch recent playlist items, stop after entries cross the one-month boundary, and deduplicate by video ID. A query Follow consumes one of the project's 100 daily search calls on every refresh unless results are cached across Users or refresh is throttled. Quota extensions require a compliance audit. ([quota audit](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits))

YouTube's policies prohibit scraping YouTube applications or using undocumented APIs, require YouTube attribution, and require stored non-authorized API data to be deleted or refreshed after 30 calendar days. They also require API clients to maintain a privacy policy and link to YouTube's terms. ([YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)) This creates an architectural obligation: durable Candidate/Discovery history can keep Unshelf's own provider ID and lifecycle facts, but cached YouTube display metadata must be refreshed or removed on the policy cadence. That separation should be explicit before implementation.

### RSS/Atom and engineering websites: prefer advertised feeds

RSS and Atom are sufficiently structured for deterministic intake. Atom provides the strongest identity contract because every entry must have an ID, title, and updated timestamp, and the ID is intended to remain permanent. RSS is looser: an item requires a title or description, while link, publication date, and GUID are optional. ([Atom entries](https://www.rfc-editor.org/rfc/rfc4287#section-4.1.2), [Atom ID](https://www.rfc-editor.org/rfc/rfc4287#section-4.2.6), [RSS items](https://www.rssboard.org/rss-specification#hrelementsOfLtitemgt))

OpenAI currently publishes a first-party [News RSS feed](https://openai.com/news/rss.xml) whose entries expose title, description, link, GUID, category, and publication time. The [Google Developers Blog feed](https://developers.googleblog.com/feeds/posts/default/) similarly exposes RSS entries with title, link, description, and GUID. Substack documents the same conventional feed path for [public publications](https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication). By contrast, no RSS/Atom alternate link was present in the retrieved HTML for [Anthropic's engineering index](https://www.anthropic.com/engineering) on the research date; that page is an HTML-extraction target unless Anthropic publishes a supported feed elsewhere. This page inspection is not evidence for a universal engineering-blog API.

The acquisition order for a website Follow should be deterministic:

1. accept a user-supplied feed URL;
2. discover an advertised RSS/Atom alternate link;
3. try a documented provider/site integration;
4. use a reviewed site-specific HTML adapter only where permitted; and
5. surface “unsupported” rather than silently asking a general agent to browse and guess.

A sitemap may assist URL discovery, but its protocol provides only URL location plus optional last-modified, change-frequency, and priority hints. It cannot by itself satisfy Candidate title, Type, publisher, or summary requirements. ([Sitemaps protocol](https://www.sitemaps.org/protocol.html))

### Email: access is possible, but “newsletter Candidate” is underspecified

Gmail's API makes deterministic retrieval straightforward: list matching messages, then get metadata or the parsed payload for each immutable message ID. Incremental synchronization through `historyId` is available, but Gmail says history records are typically available for at least a week and may sometimes be available for less; an expired `startHistoryId` returns HTTP 404 and requires full synchronization. ([Gmail sync guide](https://developers.google.com/workspace/gmail/api/guides/sync)) For app-open/manual refresh and a one-month window, a bounded search is simpler than depending on a history cursor, though an implementation may later combine both.

For Cloud projects created under Gmail's current quota model, the API allows 1,200,000 units per minute per project and 6,000 per minute per User; `messages.list` costs five units and each `messages.get` costs twenty. ([Gmail usage limits](https://developers.google.com/workspace/gmail/api/reference/quota)) Listing is therefore cheap, but materializing a large result set can fan out into enough per-message reads to require paging, throttling, and bounded retry.

The harder question is not fetching mail but defining the Candidate. Subject, sender, date, message ID, and snippet can describe a newsletter issue. They do not reliably identify the article URL that should become the Item Source. Extracting a canonical outbound link generally requires transient access to the message body, which moves the integration from metadata-only mailbox access toward the restricted `gmail.readonly` scope. Google requires restricted-scope verification for public apps, and says apps that store or transmit restricted data through servers may require an annual third-party security assessment. ([Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification))

Google's API Services User Data Policy also limits use and transfer of Google user data to the disclosed, user-facing feature, requires clear privacy disclosures and consent, and requires secure handling. ([Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)) These obligations reinforce keeping transient body access narrow and not retaining full newsletter content.

The map therefore needs a decision between:

- a dedicated forwarding address that receives only messages the User elects to send to Unshelf; and
- Gmail OAuth, with selection by label, sender, list identifier, or query and an explicit body-processing/privacy contract.

That decision must also answer whether one newsletter email is itself the Candidate or whether each canonical article linked within it is a Candidate. This memo recommends a dedicated follow-up decision ticket rather than burying the choice in implementation.

### Substack: use existing transports

Substack says every publication has an RSS feed at the publication subdomain's `/feed` path and advertises RSS/sitemap generation as a publication feature. ([RSS help](https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication), [features](https://substack.com/features)) Its current Developer API terms list public creator and publication profile data as authorized data, but do not list post content or post records. ([Developer API terms](https://substack.com/api-tos)) The documented public-post route is therefore RSS, not a special Substack post adapter.

For paid/private text newsletters, email is the portable supported input in the sources reviewed here. Substack documents private RSS specifically for podcast subscribers; that does not establish a private RSS path for all paid text posts. ([private podcast RSS](https://support.substack.com/hc/en-us/articles/4519588148244-How-do-I-listen-to-episodes-on-my-podcast-app))

### X: technically viable, intentionally later

Public account timelines are the only reviewed ordinary X target that can span the agreed one-month initial lookback: the endpoint returns up to the latest 3,200 posts, so even that coverage is incomplete when an account exceeds the cap inside a month. Recent search covers seven days; full-archive search is needed to guarantee a month for arbitrary queries. ([timelines](https://docs.x.com/x-api/posts/timelines/introduction), [search](https://docs.x.com/x-api/posts/search/introduction)) X uses pay-per-use pricing with prepaid credits and publishes exact endpoint rates inside its Developer Console, while its public pricing page describes the model rather than stable endpoint prices. Pay-per-use access is capped at two million Post reads per month, above which X directs developers to Enterprise. ([pricing](https://docs.x.com/x-api/getting-started/pricing), [Post cap](https://docs.x.com/x-api/fundamentals/post-cap))

X's policies require the official API, prohibit scraping and browser automation, require current display and attribution, and require deletion or modification when platform content is deleted or changed. ([Developer Policy](https://docs.x.com/developer-terms/policy), [Developer Guidelines](https://docs.x.com/developer-guidelines)) An agentic browser fallback is therefore not an acceptable acquisition tier for X.

The content model also needs a deliberate mapping. A Post has text but no title field, and an edit creates a new Post ID linked through edit history. ([data dictionary](https://docs.x.com/x-api/fundamentals/data-dictionary), [edit history](https://docs.x.com/x-api/fundamentals/edit-posts)) Unshelf must decide whether the Post itself is a Candidate, with a deterministic title derived from text, or whether only a linked article becomes a Candidate. That is a product-semantic question, not a parser question.

### daily.dev: a clean aggregator API with onboarding friction

daily.dev's Public API directly supports personalized feeds, source feeds, tag feeds, custom feeds, and post search. Its OpenAPI document exposes cursor pagination and a `month` search window, while post records include a stable ID, title, URL, source, tags, nullable summary/publication time, image, and type. ([Public API](https://docs.daily.dev/public-api/), [OpenAPI document](https://api.daily.dev/public/v1/docs/json)) The documented rate limits are 300 requests per minute per IP and 60 per minute per User. ([Public API](https://docs.daily.dev/public-api/))

The first tradeoff is onboarding: API access requires an active Plus subscription and a personal-access token copied by the User. ([Public API](https://docs.daily.dev/public-api/)) The second is licensing. The API documentation invites custom integrations, AI agents, and automation, while daily.dev's general Terms grant a revocable license solely for personal internal use, restrict commercial exploitation, and prohibit scraping the application. ([Public API](https://docs.daily.dev/public-api/), [Terms](https://daily.dev/tos)) No separate commercial Public API terms were found in the reviewed first-party material, so Unshelf should obtain written clarification before a production service integration and must use the API rather than scrape daily.dev.

Subject to that clarification, daily.dev remains a strong later adapter for validating the Provider seam, but a poor prerequisite for the first Discover release. Its `source` object is publisher metadata; daily.dev remains the identity authority for Candidates it returns.

## Refresh, retention, and failure semantics

The agreed refresh policy—on app open and manual refresh, with no background polling—does not remove the need for provider-specific throttling. A User may open the app repeatedly, and one app-level action can fan out to many Follows. The Provider boundary should therefore return a deterministic result such as:

- `refreshed`, with discovered entries and a provider cursor/watermark;
- `notModified` or `throttled`, preserving the last successful state;
- `partial`, with the available lookback and a reason the requested month was not covered;
- `reauthorizationRequired`; or
- `providerError`, retaining existing Candidates and exposing a retryable failure.

The one-month window should mean “request or scan up to one month where the provider exposes it,” not “guarantee a month from every Provider.” A short RSS feed, X recent search, or a newly connected mailbox may expose less. This limitation should appear in the Follow's refresh status rather than silently changing Candidate semantics.

Retention also has two layers:

- Unshelf-owned lifecycle and provenance: Candidate identity, Follow links, Discoveries, Seen/Keep/Dismiss state, timestamps, and Item relationship; and
- provider-supplied display cache: title, excerpt, thumbnail, publisher details, and deletion/edit status.

This separation is required in practice by providers such as YouTube and X, whose policies require stored/displayed provider data to be refreshed or removed on their schedules. ([YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies), [X Developer Policy](https://docs.x.com/developer-terms/policy)) It also supports the product decision that a kept Item snapshots metadata while Discovery provenance remains durable.

## Answer to the agent-parsing question

An agent is not a new source of access. It can only operate after Unshelf has a permitted way to retrieve content, and its output still needs deterministic validation before it can create stable Candidates.

Use this rule:

1. **Official structured API or feed:** parse deterministically.
2. **Static or rendered HTML explicitly allowed for the site adapter:** deterministic selectors and structured-data parsing first.
3. **Agent-assisted extraction:** optional repair layer for already retrieved HTML, producing a proposed record that must pass schema, canonical-URL, date, and identity validation. Never let model text invent a provider ID.
4. **Unsupported or prohibited access:** stop. An agent must not bypass authentication, rate limits, robots/access controls, or provider terms.

The core Provider contract should therefore remain deterministic even if one adapter internally uses an agent as a fallible extraction component. The adapter owns validation, provenance, retry policy, and a stable identity rule; the shared Discover domain never sees “agent output” as a special Candidate kind.

## Decisions enabled and open seams

This research supports the following map-level decisions:

- YouTube can ship first through its official Data API, with channel uploads and playlists before queries.
- RSS/Atom should be the second Provider adapter and should absorb public Substack and feed-capable engineering publications.
- Provider, Follow target, and publisher are separate concepts.
- Candidate identity is exact and provider-namespaced; Source is not a universal deduplication key.
- Acquisition remains deterministic. Agent-assisted HTML extraction is an implementation detail behind a validated site adapter, never a bypass for unavailable or prohibited access.
- One-month lookback is best-effort per Provider and must expose partial coverage.
- Durable lifecycle/provenance must be separated from refreshable provider display metadata.

Two product seams remain too consequential to hide in implementation:

1. **Choose newsletter intake and Candidate Source semantics.** Decide dedicated forwarding versus Gmail OAuth; newsletter-issue versus linked-article Candidate; Follow selection; transient body processing; and privacy/retention.
2. **Choose social-post Candidate semantics before adding X.** Decide Post versus linked-article Candidate, deterministic title and Type mapping, edit-chain identity, display/attribution, and query lookback cost.

The second can remain map fog while X is explicitly later. The first should become a decision ticket before email is placed on an implementation path.

## Evidence limits

- No authenticated YouTube, Gmail, X, or daily.dev calls were executed, so account-specific entitlements and console-only pricing were not tested.
- Feed and HTML behavior can change independently of published standards. Each adapter still needs contract fixtures and live failure telemetry.
- This review establishes supported access and identity, not relevance filtering, ranking, or cross-provider content equivalence.
- Provider policies and prices are time-sensitive; implementation must re-check the cited first-party terms before launch.
