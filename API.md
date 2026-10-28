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

Record: `{ id, sport, value, duration, occurredAt, photo }`. `photo` is a filename identifier or null; never a public URL. `sport` is `running`, `swimming`, `pushups`, or `abs`. `value` is >0 and ≤100000, pushups integer; units km / m / repetitions / minutes. `duration` is an integer 1–86400 seconds. `occurredAt` must be a valid, non-future date; canonical storage format is UTC ISO8601. Photo JPEG/PNG/WebP, max8MB; actual file signature checked and used as the stored Content-Type; inaccurate multipart MIME labels are tolerated. Responses use `Cache-Control: no-store`. Sessions expire after7 days.

App repo duplicates the small calendar aggregation helper to remain independently buildable; keep both `src/stats.js` copies consistent. Mobile tokens belong in SecureStore; browser uses the cookie, not localStorage. The service is deliberately single-account. Cloudflare deployment supports invitation-protected first-owner registration; creating the first account closes registration atomically. The retained legacy Express server uses OWNER_EMAIL/OWNER_PASSWORD initialization instead. No multi-user access is offered.

Mobile clients convert selected/captured photos (including iPhone HEIC) to a real JPEG before upload, preserving aspect ratio and limiting the long edge to 2400px. The 8MB limit applies to the converted file. Browser uploads must already be JPEG/PNG/WebP. Unsupported or forged bytes are rejected.

## Record subtypes (2026-10-28)

Records additionally return `subtype: string | null`. Swimming accepts `breaststroke` (蛙泳), `butterfly` (蝶泳), `freestyle` (自由泳); abs accepts `situps` (仰卧起坐), `abwheel` (腹肌轮). Running/pushups do not accept a subtype. Mismatched or unknown values return 400. New app/web forms always send the selected subtype for swimming/abs; omission remains accepted for older installed clients and is stored as null, displayed as 未分类. No historical type is inferred.

One check-in may contain multiple type details with their own volume and duration, sharing one ID, timestamp and photo. All-type check-in counts count parent records, not details. Swimming retains meters; abs retains the existing minutes volume and a separately recorded duration in seconds. Week/month/year reports filter volume, duration, bars and recent records together. The all-types view additionally summarizes each type, including unclassified records when present.

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
