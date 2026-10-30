# Shared API contract v1

Base: `/api`. JSON responses. Error bodies: `{ "error": "…" }`. Login via email and password; except health/setup/register/login, routes require `Authorization: Bearer <token>` or the browser's HttpOnly session cookie. Logout invalidates that session server-side.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Database connectivity check → `{ok:true}` |
| GET | `/setup` | `{registrationAvailable}`; no secret disclosure |
| POST | `/register` | JSON `{email,password,setupCode}` → session (201); first owner only, valid invitation, password ≥8 characters; later registrations409 |
| POST | `/login` | JSON `{email,password}` → `{token,email}`; sets browser cookie |
| GET | `/me` | `{email}` |
| POST | `/logout` | 204 |
| GET | `/records` | All personal records, newest first |
| POST | `/records` | Multipart `sport,value,duration,occurredAt`, optional `subtype` and `photo` → record (201) |
| DELETE | `/records/:id` | Deletes record and photo (204) |
| GET | `/photos/:id` | Authenticated image bytes |
| GET | `/export?sport=swimming&subtype=freestyle` | `.xlsx` of selected sport/type; omit subtype for all types, use `unclassified` for legacy records; omit sport for all sports |

Record: `{ id, sport, value, duration, occurredAt, photo }`. `photo` is a filename identifier or null; never a public URL. `sport` is `running`, `swimming`, `pushups`, or `abs`. `value` is >0 and ≤100000, pushups integer; units km / m / repetitions / abs repetitions (legacy abs records retain minutes). `duration` is an integer 1–86400 seconds. `occurredAt` must be a valid, non-future date; canonical storage format is UTC ISO8601. Photo JPEG/PNG/WebP, max8MB; actual file signature checked and used as the stored Content-Type; inaccurate multipart MIME labels are tolerated. Responses use `Cache-Control: no-store`. Sessions expire after7 days.

App repo duplicates the small calendar aggregation helper to remain independently buildable; keep both `src/stats.js` copies consistent. Mobile tokens belong in SecureStore; browser uses the cookie, not localStorage. The service is deliberately single-account. Cloudflare deployment supports invitation-protected first-owner registration; creating the first account closes registration atomically. The retained legacy Express server uses OWNER_EMAIL/OWNER_PASSWORD initialization instead. No multi-user access is offered.

Mobile clients convert selected/captured photos (including iPhone HEIC) to a real JPEG before upload, preserving aspect ratio and limiting the long edge to 2400px. The 8MB limit applies to the converted file. Browser uploads must already be JPEG/PNG/WebP. Unsupported or forged bytes are rejected.

## Record subtypes (2026-10-28)

Records additionally return `subtype: string | null`. Swimming accepts `breaststroke` (蛙泳), `butterfly` (蝶泳), `freestyle` (自由泳); abs accepts `situps` (仰卧起坐), `abwheel` (腹肌轮). Running/pushups do not accept a subtype. Mismatched or unknown values return 400. New app/web forms always send the selected subtype for swimming/abs; omission remains accepted for older installed clients and is stored as null, displayed as 未分类. No historical type is inferred.

One check-in may contain multiple type details with their own volume and duration, sharing one ID, timestamp and photo. All-type check-in counts count parent records, not details. Swimming retains meters; new abs records use per-set repetitions and a separately recorded exercise duration; legacy minute records retain their unit. Week/month/year reports filter volume, duration, bars and recent records together. The all-types view additionally summarizes each type, including unclassified records when present.

Excel includes Chinese 运动类型 at F and 打卡编号 at G, preserving the original five columns. Each detail is one export row; rows from one check-in share the same ID. An export follows the selected type over all available history, as before; report period does not limit export. Both independently buildable repositories keep identical `src/stats.js` and `src/subtypes.js` copies.

Cloudflare applies additive migration `0002_record_subtype.sql`; the retained SQLite server detects and adds the nullable column at startup. Existing records/photos/accounts remain in place. Always use explicit column lists for future INSERT statements.


## Multiple details per check-in (2026-10-28 correction)

New swimming/abs forms send multipart `details` containing JSON such as:

```json
[{"subtype":"breaststroke","value":400,"duration":240},{"subtype":"butterfly","value":100,"duration":60},{"subtype":"freestyle","value":1000,"duration":600}]
```

The backend validates every detail and computes top-level `value=1500`, `duration=900`. Supplied top-level totals cannot override these sums. Details must be nonempty, valid for the sport, unique by type, and have positive finite volume and integer duration. The total limits remain 100000 volume and 86400 seconds. A mixed session has top-level subtype=null but is never treated as unclassified; classification uses its details. The API returns details as an array, not a database JSON string.

Records lacking details keep their existing single subtype or unclassified state. Previously separate check-ins are not automatically merged. D1 migration `0003_record_details.sql` adds a nullable JSON-text column without rewriting historical data; Express upgrades the equivalent SQLite column at startup. One database row owns all details atomically. Deleting one check-in deletes its shared photo and every detail together.

Week/month/year reports project each parent onto selected detail metrics, keeping one count per matching parent. Export filters details and adds the shared check-in ID so three spreadsheet rows cannot be mistaken for three separate check-ins. Totals in the all-types report count each parent once.


## Muscle training sets and quantity units

New abs/pushups details carry `sets: number[]`, e.g. `[{"subtype":"situps","sets":[20,20,15],"duration":600},{"subtype":"abwheel","sets":[10,10,8],"duration":300}]`. There are 1–100 sets per exercise, each a positive integer; the backend derives each detail's value and the parent's value, ignoring supplied total values. The example totals 83 repetitions, 6 sets and one check-in. Duration is recorded once per exercise, not per set. Pushup details use `subtype:null` and exactly one detail containing its sets. Swimming rejects sets.

`quantityUnit` is `reps` for newly grouped abs records and `minutes` for legacy total-only abs payloads. Omitted historical metadata also means minutes for abs. The server infers this from validated set arrays; clients cannot turn old minute totals into counts by merely sending a unit. A single abs check-in cannot mix grouped repetitions with minute-based details. Additive migration 0004 stores the unit; prior rows remain untouched.

Reports expose setCount and legacyCount. Abs volume totals and bars include only repetition-based rows. Duration/check-in counts retain all matching records; legacy rows remain visible with minutes. Excel keeps original columns and adds H=分组明细 with human-readable numbered sets. Each row carries its actual unit in D. Both clients share these aggregation/unit rules.


## Optional long-term plans and widgets

Authenticated GET /api/plans returns plan specs and computed progress. POST /api/plans creates a single-sport plan with title, startDate, goalDays (1–3650) or endMode=date/endDate, timeZone, repeat {frequency,interval,weekdays,monthMode}, reminderEnabled and reminderTime. One active or paused plan per sport is enforced by a unique database index.

POST /api/plans/:id takes the current numeric revision plus action edit/pause/resume/extend/finish/archive. Extend accepts a larger total goalDays, preserves id/start/history, and records the previous milestone. Stale revisions return409. Edits affect future schedule dates; pauses stop notifications and extend the end on resume.

Records accept optional multipart planId; sport and plan date range are validated before upload storage. Omitted planId remains independent. Responses return nullable planId. GET /api/export?sport=abs&planId=free (or a plan ID) filters Excel and adds I=关联计划. Previous A–H columns remain unchanged.

POST /api/widget-links {planId} returns a12-character readonly code and replaces that plan's previous link. DELETE /api/widget-links {planId} revokes it. These endpoints require login. GET /api/widget-state uses X-DailyRep-Widget-Key instead of a login session; returns only planId/title/sport/status/progress/updatedAt, no records, account data or photos. Codes are stored as SHA256 hashes and the public endpoint is separately rate limited.

Migration0005 adds training_plans, nullable records.planId and widget_links without rewriting historical records. Express initializes equivalent schema. Keep both repositories' src/plans.js identical. Notifications are scheduled locally on iPhone; webpage changes require reopening the phone app to sync.


## All-plan widget scope

Authenticated POST /api/widget-links with {"scope":"all"} generates/replaces the account's readonly all-plan code; DELETE with the same body revokes it. GET /api/widget-state recognizes this code and returns {scope:"all",plans:[summaries],updatedAt}; excludes archived plans and sorts today's due incomplete active plans first, then other active/paused/finished plans. Summaries contain only planId/title/sport/status/progress. New plans are included automatically. Existing plan-specific codes retain their original scope and original top-level response fields, with plans:[summary] added for the new widget. Migration0006 creates a separate hashed collection-link table without altering existing codes or records.
