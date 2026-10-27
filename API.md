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
| POST | `/records` | Multipart `sport,value,duration,occurredAt` and optional `photo` → record (201) |
| DELETE | `/records/:id` | Deletes record and photo (204) |
| GET | `/photos/:id` | Authenticated image bytes |
| GET | `/export?sport=running` | `.xlsx` of selected sport; omit sport for all records |

Record: `{ id, sport, value, duration, occurredAt, photo }`. `photo` is a filename identifier or null; never a public URL. `sport` is `running`, `swimming`, `pushups`, or `abs`. `value` is >0 and ≤100000, pushups integer; units km / m / repetitions / minutes. `duration` is an integer 1–86400 seconds. `occurredAt` must be a valid, non-future date; canonical storage format is UTC ISO8601. Photo JPEG/PNG/WebP, max8MB; actual file signature checked and used as the stored Content-Type; inaccurate multipart MIME labels are tolerated. Responses use `Cache-Control: no-store`. Sessions expire after7 days.

App repo duplicates the small calendar aggregation helper to remain independently buildable; keep both `src/stats.js` copies consistent. Mobile tokens belong in SecureStore; browser uses the cookie, not localStorage. The service is deliberately single-account. Cloudflare deployment supports invitation-protected first-owner registration; creating the first account closes registration atomically. The retained legacy Express server uses OWNER_EMAIL/OWNER_PASSWORD initialization instead. No multi-user access is offered.

Mobile clients convert selected/captured photos (including iPhone HEIC) to a real JPEG before upload, preserving aspect ratio and limiting the long edge to 2400px. The 8MB limit applies to the converted file. Browser uploads must already be JPEG/PNG/WebP. Unsupported or forged bytes are rejected.
