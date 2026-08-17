# One Item spine, with per-type details deferred to their own tables

Every captured thing is modelled as a single **`Item`** — a shared spine
(`id`, `user_id`, `title`, optional `source` link, `type`, `status`) that
everything else references — rather than as five independent per-type models
(Article, Book, Course, Playlist, Video) or one wide table carrying every
type's columns. Richer per-type fields live in separate detail tables
(`BookDetails`, `CourseDetails`, …) attached by `item_id`, and are built only
when a type actually earns them — **none exist in v1**. We chose this because the
things that would differentiate the types (chapters, lessons, per-video
tracking) are deferred (ADR-0002, #9), leaving every type with identical data,
while the operations Unshelf performs constantly — dumping into All, pulling into
Stops, marking progress — all treat Items uniformly and point at one stable Item
identity.

## Considered options

- **Five independent per-type models.** Rejected: every cross-cutting operation
  (list All, a Stop's contents, "how many are in progress") would fan out across
  five tables, and every reference to an item — Stop membership, the Trail, and
  the future schedules (#6) and reminders (#7) — would become a fragile five-way
  polymorphic reference. Adding a sixth type would mean editing all of them.
- **One wide table with every type's columns.** Rejected: mostly-empty per-type
  columns, and no clean way to require per-type fields. The detail-table pattern
  gives each type its own structure without polluting the spine.

## Consequences

- **`Item` is scoped to a User** (ADR-0001); `user_id` is on the spine.
- **Item ↔ Stop is many-to-many via a `StopItem` join table.** Because one Item
  can live in many Stops, **`status` lives on the Item** — one shared value seen
  the same everywhere — not on the link. The join carries no status.
- **All is not a table.** It is the query "every `Item` where `user_id` = me", so
  v1 needs no folder machinery; Stops are overlays that reference Items.
- **v1 field shape:** `title` required (it is the Item's identity), `source`
  optional (offline books have none), `type` user-chosen from
  {article, video, playlist, course, book, other} with no default, `status` from
  {not started, in progress, done} defaulting to *not started*. The enum values
  are cheap to revise later; the spine/detail split is the load-bearing decision.
- **No durable fetched-detail projection in v1.** Source inspection may suggest
  ordinary editable title and Type values before explicit Capture, but stores no
  evidence or fetched metadata. Thumbnail, table-of-contents, and richer
  auto-fetch remain deferred; when picked up (#9), they attach to the spine via
  detail/sub-item tables without reshaping it.
