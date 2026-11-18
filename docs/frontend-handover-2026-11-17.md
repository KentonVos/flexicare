# Flexicare Quiz — Frontend Integration Handover

> Audience: the AI agent implementing the Webflow UI. This document is the complete
> contract for the session/quiz flow, kiosk device mode and the prize spin. Everything
> here was verified against the live backend code. Swagger UI is available on staging
> at `https://api-staging-discovery.injozitech.com/docs` (disabled in production),
> but this document is self-sufficient — you do not need Swagger to implement the flow.

---

## 1. Fundamentals

- **Base URLs** — all API routes are prefixed with `/api/v1`:
  - **Production:** `https://admin.flexi-play.co.za`
    Example: `https://admin.flexi-play.co.za/api/v1/sessions`.
  - **Staging:** `https://api-staging-discovery.injozitech.com` (test data; content may
    differ from production).
  The kiosk build and the live Webflow site must point at production; use staging for
  development only. Kiosk device tokens are per environment — a tablet paired against
  staging is not paired against production.
- **Authentication for web visitors: NONE.** There is no login, no API key. When you
  create a session you receive a UUID (`id`). That UUID is the only credential — pass
  it as a path parameter on every subsequent call. Treat it as a secret: keep it in
  memory / `sessionStorage`, do not log it.
- **`X-Kiosk-Token` header (kiosk devices only).** The same frontend also runs on
  in-store tablets ("kiosk mode", §6). A kiosk is paired once and receives a long-lived
  **device token** (`kt_` + 43 URL-safe characters, 46 characters total). The kiosk
  sends it as the HTTP header `X-Kiosk-Token: kt_…` on exactly two calls:
  `POST /sessions` (§3.2) and `POST /sessions/{id}/spin` (§7.2), plus the kiosk's own
  `/kiosks/*` endpoints (§6). **Web visitors never send this header** — a browser on
  the public site has no token and must not try to obtain one. The token identifies a
  device, not a person; it is the only long-lived credential in the whole frontend.
- **Content type:** all request bodies are `application/json` (except the raw photo
  upload, see §5).
- **Errors:** standard FastAPI shape `{ "detail": "<message>" }`. Relevant codes:
  - `401` — `X-Kiosk-Token` present but invalid or revoked (kiosk only: clear the token and show the unpaired screen, §6.5).
  - `403` — kiosk is `DISABLED`, or a spin attempted from a different kiosk than the one that started the session.
  - `404` — unknown `session_id`, unknown/expired pairing code, no prize for a session.
  - `409` — session state conflict (answering/finishing a session that is not `IN_PROGRESS`, finishing twice, spin preconditions, phone locked after a spin).
  - `422` — validation failure (unknown question/option code, option doesn't belong to question, empty answers list, unsupported image type, malformed pairing code).
  - `429` — too many requests (pairing, spin and identity capture are rate-limited). The response carries
    a `Retry-After` header with the number of **seconds** to wait; read it, show
    "try again in N seconds", and do not retry before it elapses.
  - `503` — prize wheel not configured on the server (§7.4) — show fallback copy, never block the flow.
- **CORS:** wide open (`Access-Control-Allow-Origin: *`) during development — calls
  work from any origin, including the Webflow staging domain and localhost. It will be
  locked down to the production frontend origin before go-live; no credentials/cookies
  are involved (`X-Kiosk-Token` is a plain custom header, not a cookie), so nothing on
  the frontend changes when that happens.

### Enums (exact values, case-sensitive)

| Enum | Values |
|---|---|
| `Language` | `en`, `zu`, `st`, `af` (only `en` is fully populated; others may return blank strings) |
| `QuizStage` | `ROUTING`, `FLEX` |
| `ArchetypeCode` | `A`, `B`, `C` |
| `ProductCode` | `CORE`, `PLUS` |
| `SessionStatus` | `IN_PROGRESS`, `COMPLETED`, `ABANDONED` |
| `SessionChannel` | `KIOSK`, `WEB` — how the session was started (§3.2); only `KIOSK` sessions can spin |
| `ImageStatus` | `PENDING`, `GENERATING`, `READY`, `FAILED` |
| `AvatarRace` | `black`, `white`, `indian`, `asian`, `coloured` |
| `AvatarGender` | `male`, `female` |
| `AvatarAgeGroup` | `young_adult`, `middle_aged`, `elder` |
| `KioskStatus` | `ACTIVE`, `DISABLED` (§6.4) |
| `PrizeAwardStatus` | `AWARDED`, `REDEEMED`, `VOIDED`, `EXPIRED` (§7.3) |

### Code formats (kiosk mode only)

| Thing | Format | Example |
|---|---|---|
| Pairing code | 8 characters as `XXXX-XXXX`, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `I`, `O`, `0`, `1`) | `7K3M-9Q2A` |
| Device token | `kt_` followed by 43 URL-safe characters (`A–Z a–z 0–9 - _`) | `kt_Q4v…` (46 chars) |
| Claim code | `FLX-XXXX-XXXX`, same alphabet as the pairing code. **Never sent to the frontend** — the shopper gets it on WhatsApp (§7) | `FLX-7K3M-9Q2A` |

The shared alphabet is deliberately unambiguous for reading aloud and typing on a
tablet: never render these codes in a font where `0/O` or `1/I/l` could be confused,
and always show them upper-case.

---

## 2. The flow at a glance

```
0. (kiosk only, once per device) pair → store device token → heartbeat loop (§6)
1. POST /api/v1/sessions                          → session id (status IN_PROGRESS)
                                                     kiosk: send X-Kiosk-Token → channel KIOSK
2. GET  /api/v1/quiz?lang=en                      → ALL questions + options (one fetch)
3. (optional) photo — EITHER: presign → PUT to MinIO → confirm
                      OR:     pick a pre-made avatar (GET /avatars → PATCH …/photo/avatar)
                      (either path kicks off background image generation)
4. For each ROUTING question (R01…R05, in position order):
       POST /api/v1/sessions/{id}/answers  { answers: [ {question_code, option_code} ] }
5. POST /api/v1/routing/preview with the routing answers → archetype (A/B/C)
6. For each FLEX question belonging to that archetype (in position order):
       POST /api/v1/sessions/{id}/answers  (same shape, one at a time)
7. POST /api/v1/sessions/{id}/finish              → final result (archetype, product, price)
8. Poll GET /api/v1/sessions/{id}/images until READY → show with/without-insurance images + outcome text
9. (optional, results screen) PATCH …/contact/phone (+ marketing_consent) and/or …/contact/email
10. (kiosk only) phone captured (§3.10) → POST /api/v1/sessions/{id}/spin → "check your WhatsApp" screen (§7)
                                             web sessions skip this step entirely

At any point: GET /api/v1/sessions/{id}          → full session state + stored answers (resume / re-fetch results)
```

**Critical architectural fact:** the backend has no "current question" or "next
question" endpoint. The frontend fetches the entire question set once (step 2) and
drives the question-by-question progression itself, persisting each answer to the
server as the user answers it (steps 4/6). The server stores one answer row per
question per session, so server-side progress is always up to date — but the *UI*
position (which question is on screen) is frontend state.

**Branching:** there is no server-side branching. The quiz has two stages:
- `ROUTING` questions (`archetype: null`) — everyone answers all of them.
- `FLEX` questions — each is tagged with an `archetype` (`A`, `B`, or `C`). Show
  **only** the FLEX questions whose `archetype` matches the result of the routing
  preview (step 5). The user must never see FLEX questions for other archetypes.

**Kiosk vs web:** the same build serves both. The only behavioural differences are
step 0 (pairing/heartbeat), the header on step 1, and step 10 (spin). Decide "am I a
kiosk?" from the presence of a stored device token (§6.2); confirm it from the
session's `channel` field (§3.2) — if a session came back as `WEB`, the spin step
must not be shown even on a tablet.

---

## 3. Endpoint reference

### 3.1 `GET /api/v1/quiz` — fetch all questions

Query params:
- `lang` (optional, default `en`) — one of the `Language` values.
- `stage` (optional) — `ROUTING` or `FLEX` to filter. You can fetch each stage
  separately, or fetch everything in one call and filter client-side (recommended).

Response `200`: array of questions, already sorted by `(stage, position)`; options
sorted by `position`. Render in that order — do not re-sort by anything else.

```json
[
  {
    "code": "R02",
    "stage": "ROUTING",
    "archetype": null,
    "position": 2,
    "prompt": "…question text…",
    "helper": "…optional helper text or null…",
    "drives_echo": false,
    "options": [
      { "code": "R02_a", "label": "…", "position": 1 },
      { "code": "R02_b", "label": "…", "position": 2 }
    ]
  }
]
```

Field notes:
- `code` is the stable identifier you send back when answering (`question_code`).
  Option `code` likewise (`option_code`). Never send labels or positions back.
- `archetype` is `null` for ROUTING questions and `"A"|"B"|"C"` for FLEX questions —
  this is the field you filter FLEX questions by after the routing preview.
- `drives_echo: true` marks the one question (R03) whose chosen option label should be
  remembered by the frontend and echoed into later copy on screen. Store the selected
  option's `label` locally when the user answers it.

### 3.2 `POST /api/v1/sessions` — start a session

Body (all fields optional; `{}` is valid):

```json
{ "language": "en", "first_name": "Thandi", "gender": "female" }
```

`first_name` is capped at 60 characters and `gender` at 40 (`422` beyond that);
both are whitespace-trimmed server-side.

`gender` takes three values from the registration form: `"male"`, `"female"`, or
`"prefer_not_to_say"`. The third is stored as the player's answer, is never used to
describe them in the generated images, and is reported as its own group. It exists on
the registration form only: the avatar picker (§3.7) still filters faces by
`male`/`female`, and a player may pick any face and then choose "Prefer not to say"
here. Do not pre-select it from the picker's filter.

**Header (kiosk only):** a paired kiosk sends `X-Kiosk-Token: kt_…` (§6). This is
what binds the session to the device and the store, and it is the **only** way a
session becomes eligible for the prize spin. Web visitors send no header.

Response `201` — `SessionOut`:

```json
{
  "id": "3f0b7f6e-…-uuid",
  "status": "IN_PROGRESS",
  "channel": "KIOSK",
  "kiosk_id": "c1a2b3d4-…-uuid",
  "location_id": "9e8d7c6b-…-uuid",
  "language": "en",
  "first_name": "Thandi",
  "last_name": null,
  "gender": "female",
  "phone_number": null,
  "email": null,
  "marketing_consent": false,
  "id_type": null,
  "id_number_masked": null,
  "archetype_id": null,
  "tier_score": null,
  "recommended_product_id": null,
  "recommended_price_cents": null,
  "created_at": "2026-07-15T10:00:00Z",
  "completed_at": null
}
```

- `channel` is `"KIOSK"` when a valid `X-Kiosk-Token` was sent, otherwise `"WEB"`.
- `kiosk_id` / `location_id` are the device and store the session was started on,
  snapshotted at creation (moving the kiosk to another store later does not change
  them). Both are `null` for `WEB` sessions.
- `phone_number` / `email` stay `null` until set via §3.10; `last_name`,
  `id_type` and `id_number_masked` until set via §3.11. Store `id` — every
  other call needs it.
- **`id_number_masked` is never the raw document number.** Identity numbers are
  encrypted at rest (POPIA) and these endpoints are unauthenticated, so the API
  only ever returns the last four characters — `"•••••••••0088"`. If you need to
  show the player what they typed, keep it in your own form state; there is no
  way to read it back. `phone_number` and `email` are still returned in full.
- `SessionOut` is also what §3.3, §3.8, §3.10, §3.11 and photo confirm (§5) return, so
  `channel`/`kiosk_id`/`location_id` appear on all of those too.

Kiosk-specific errors (never occur without the header):
- `401` — the token is invalid or has been revoked by an admin. The kiosk must
  **clear its stored token and show the unpaired screen** (§6.5). Do **not** silently
  retry without the header — that would create a `WEB` session on a tablet that can't spin.
- `403` — the kiosk is `DISABLED`. Show the "kiosk disabled" screen (§6.5) and stop
  starting sessions until a heartbeat reports `ACTIVE` again.

### 3.3 `POST /api/v1/sessions/{session_id}/answers` — submit answer(s)

Call this **once per question as the user answers it** (list of one). Batching
multiple answers in one call also works, but per-question submission is what keeps
server-side progress tracked question by question.

Body:

```json
{ "answers": [ { "question_code": "R02", "option_code": "R02_c" } ] }
```

Response `200` — the updated `SessionOut` (same shape as §3.2; note it does **not**
include the stored answers).

Semantics:
- **Upsert per question.** Re-submitting the same `question_code` with a different
  `option_code` replaces the previous choice — this is how "go back and change an
  answer" works. No delete endpoint exists or is needed.
- `409` if the session is not `IN_PROGRESS` (e.g. already finished).
- `422` if `answers` is empty, `question_code` is unknown, or `option_code` does not
  belong to that question.

### 3.4 `POST /api/v1/routing/preview` — determine archetype mid-session

Stateless scoring: send the answers collected so far (the five ROUTING answers) and
get the archetype without touching the session. Call this after the last ROUTING
question to decide which FLEX questions to show.

Body:

```json
{
  "answers": [
    { "question_code": "R01", "option_code": "R01_a" },
    { "question_code": "R02", "option_code": "R02_c" },
    { "question_code": "R03", "option_code": "R03_b" },
    { "question_code": "R04", "option_code": "R04_a" },
    { "question_code": "R05", "option_code": "R05_d" }
  ],
  "language": "en"
}
```

Response `200`:

```json
{
  "archetype": "B",
  "archetype_label": "…localized name…",
  "archetype_scores": { "A": 3, "B": 7, "C": 2 },
  "tiebroken": false,
  "tier_score": 2,
  "product": "CORE",
  "product_label": "…"
}
```

Use only `archetype` from this call for branching; ignore `product`/`tier_score` here
(they are incomplete until FLEX answers are in). `422` if any option code is unknown.

### 3.5 `POST /api/v1/sessions/{session_id}/finish` — complete the session

No body. Call after the last FLEX question. The server re-runs the scoring engine over
**all answers stored on the session**, persists the result, and sets
`status = COMPLETED`.

Response `200` — `SessionFinishOut`:

```json
{
  "session_id": "3f0b7f6e-…",
  "status": "COMPLETED",
  "archetype": "B",
  "archetype_label": "…",
  "archetype_scores": { "A": 3, "B": 7, "C": 2 },
  "tiebroken": false,
  "tier_score": 6,
  "product": "PLUS",
  "product_label": "…",
  "recommended_price_cents": 24900
}
```

- `recommended_price_cents` is an integer in cents (divide by 100 for display) and may be `null`.
- `409` if already completed (idempotency guard — do not retry a successful finish).
- `422` if scoring fails (should not happen with valid answers; surface the `detail`).
- Prefer using this response directly for the results screen; if it is lost (reload),
  the same result fields can be re-fetched via `GET /sessions/{id}` (§3.6). Note the
  detail endpoint does not include `archetype_scores`/`tiebroken` — those exist only
  in the finish response and are not needed for the results UI.

### 3.6 `GET /api/v1/sessions/{session_id}` — full session state (resume / results)

No body. Returns everything in `SessionOut` **plus** the stored answers (ordered by
`answered_at`), the store the session belongs to, whether a prize has been awarded,
and, once the session is completed, the resolved recommendation:

```json
{
  "id": "3f0b7f6e-…",
  "status": "IN_PROGRESS",
  "channel": "KIOSK",
  "kiosk_id": "c1a2b3d4-…",
  "location_id": "9e8d7c6b-…",
  "language": "en",
  "first_name": "Thandi",
  "last_name": null,
  "gender": null,
  "phone_number": null,
  "email": null,
  "marketing_consent": false,
  "id_type": null,
  "id_number_masked": null,
  "archetype_id": null,
  "tier_score": null,
  "recommended_product_id": null,
  "recommended_price_cents": null,
  "created_at": "2026-07-15T10:00:00Z",
  "completed_at": null,
  "answers": [
    { "question_code": "R01", "option_code": "R01_a", "answered_at": "2026-07-15T10:01:12Z" },
    { "question_code": "R02", "option_code": "R02_c", "answered_at": "2026-07-15T10:01:40Z" }
  ],
  "archetype": null,
  "archetype_label": null,
  "product": null,
  "product_label": null,
  "location": { "id": "9e8d7c6b-…", "name": "Clicks Sandton City", "code": "clicks-sandton-city" },
  "has_prize": false
}
```

After `POST /finish`, the same call returns `status: "COMPLETED"` with `archetype`
(`"A"|"B"|"C"`), `archetype_label`, `product` (`"CORE"|"PLUS"`), `product_label`, and
`recommended_price_cents` populated. `404` for an unknown id.

- `location` is `{ id, name, code }` for `KIOSK` sessions and `null` for `WEB`
  sessions. `name` is display-ready store copy ("You're at …"); `code` is a stable slug.
- `has_prize` is `true` once `POST /spin` has succeeded for this session. Use it on
  resume: if `true`, show the "check your WhatsApp" screen (§7.3) instead of
  offering another spin.

Use cases:
- **Resume:** on page reload, if a session `id` is in `sessionStorage`, fetch this,
  rebuild answered-question state from `answers`, re-run `POST /routing/preview` with
  the ROUTING answers (if all five are present) to recover the archetype, and continue
  from the first unanswered question.
- **Results re-fetch:** if the finish response was lost, render the results screen
  from this payload instead.

### 3.7 `GET /api/v1/avatars?race=black&gender=male` — avatar catalog

For users who don't want to take or upload a photo: a pre-generated catalog of 9
avatars per race/gender combination (3 age groups × 3 variants). Both query params
are required (see the `AvatarRace` / `AvatarGender` enums; `422` on anything else).

```json
{
  "race": "black",
  "gender": "male",
  "avatars": [
    { "id": "8f3656e1-…", "slug": "black-male-young-adult-1", "age_group": "young_adult", "variant": 1, "status": "READY", "url": "https://…presigned…" },
    { "id": "7e022a14-…", "slug": "black-male-young-adult-2", "age_group": "young_adult", "variant": 2, "status": "READY", "url": "https://…presigned…" },
    …
    { "id": "71f49eb5-…", "slug": "black-male-elder-3", "age_group": "elder", "variant": 3, "status": "PENDING", "url": null }
  ]
}
```

- Always exactly **9** entries, ordered `young_adult` → `middle_aged` → `elder`,
  variant 1–3 within each — render directly as a 3×3 grid.
- `slug` (`{race}-{gender}-{age_group}-{variant}`) is a stable human-readable
  reference for analytics/debugging; **selection still uses `id`** (§3.8).
- `url` is only present when the avatar is **fully baked**: its own image AND its
  two pre-generated with/without-insurance scenario images are all `READY` (the
  catalog, including the scenario pairs, is curated by admins). A slot without a
  `url` — whatever its `status` says — must be rendered as a placeholder and not
  be selectable. Rule of thumb: **selectable ⇔ `url` present**.
- The URLs are presigned and **expire in ~10 minutes** — when the user switches
  race/gender, or on re-render after idling, call this endpoint again rather than
  caching URLs.

### 3.8 `PATCH /api/v1/sessions/{session_id}/photo/avatar` — select an avatar as the photo

The alternative to the presign/upload/confirm flow of §5: sets the chosen avatar
as the session photo. **Nothing is generated on this path** — every avatar has an
admin-approved with/without-insurance image pair pre-generated and stored against
it, and selecting the avatar copies that pair onto the session. So:

- `GET /sessions/{id}/images` is `READY` **immediately**, with both URLs and the
  four copy fields, on the very first call — no `GENERATING` phase, no `FAILED`
  state to design for. (Polling anyway is harmless; it just returns `READY`.)
- Every user who picks the same avatar sees the same approved image pair.

```json
{ "avatar_id": "8f3656e1-…the id from §3.7…" }
```

Returns `SessionOut` (same as photo confirm). Errors: `404` unknown session or
avatar; `409` session not `IN_PROGRESS`, or the avatar isn't fully baked (this
can't happen if you only offer avatars with a `url`, per §3.7). Selecting an
avatar after a photo (or another avatar) simply supersedes the previous images.

### 3.9 `GET /api/v1/avatars/web` — transparent-background avatars (Webflow site)

A separate image set from §3.7: the same 90 catalog slots, but with
**transparent-background webp renders** uploaded by admins, intended for the
Webflow marketing site (not the kiosk flow). No session, no auth, no selection —
purely a read-only image catalog.

All query params are **optional** filters: `race`, `gender`, `age_group` (same
enums as §1). With none, all 90 slots are returned.

```
GET /api/v1/avatars/web
GET /api/v1/avatars/web?race=indian&gender=female
GET /api/v1/avatars/web?age_group=elder
```

```json
{
  "total": 9,
  "avatars": [
    { "id": "8f3656e1-…", "slug": "indian-female-young_adult-1", "race": "indian", "gender": "female", "age_group": "young_adult", "variant": 1, "url": "https://…presigned…" },
    …
  ]
}
```

- Ordered race → gender → `young_adult` → `middle_aged` → `elder`, variant 1–3.
- There is no generation lifecycle here (no `status` field): `url` is simply
  `null` for a slot whose web image hasn't been uploaded yet — skip those.
- The images are webp with a transparent background — put them on whatever
  backdrop the design needs.
- Same URL rule as §3.7: presigned, **expire in ~10 minutes** — fetch on page
  load and re-fetch rather than caching URLs (e.g. don't hardcode them into
  Webflow assets; call the API from the page).

### 3.10 Contact capture — `PATCH …/contact/phone` and `PATCH …/contact/email`

> Name, surname and the ID/passport number from the same form go to a third
> endpoint — see §3.11.

Collected on the **results screen**. The phone number is where the player's
prize details are sent on WhatsApp after the spin (§7). Two separate endpoints — call whichever the user filled in (one, the
other, or both). Both are optional to the flow on the web; **on a kiosk the phone
number is mandatory before the spin** (§7.2) — the number is what enforces "one
spin per person".

`PATCH /api/v1/sessions/{session_id}/contact/phone`

```json
{ "phone_number": "+27 82 123 4567", "marketing_consent": true }
```

`marketing_consent` (optional, JSON boolean) is the player's answer to the
marketing opt-in shown next to the phone input.

Send the number as the player typed it. The backend saves South African numbers
in international form: `082 123 4567`, `27821234567` and `+27 82 123 4567` all
come back as `"+27821234567"` in the response. That one form is what "one spin
per person" is checked against and where the WhatsApp is sent, so the same
number typed two ways is still one person.

**The number is checked, and a bad one is `422`** — the spin cannot go ahead
until a good one is saved, because the prize is only ever sent to this number:

| Typed | Result |
|---|---|
| `082 123 4567`, `+27 82 123 4567`, `27821234567` | saved as `+27821234567` |
| `082 123 456` or `082 123 45678` (a digit short or over) | `422` |
| `011 234 5678` (landline: not 06x, 07x or 08x) | `422` |
| `82 123 4567` (no leading `0` and no country code) | `422` |
| `+44 7911 123456` (any other country) | `422` |

Only South African cellphone numbers are accepted: 10 digits starting `06`,
`07` or `08` (or `+27` and the same number without its `0`). Spaces, dashes,
dots and brackets are ignored. The message to show is in the response, e.g.

```json
{ "detail": [ { "loc": ["body", "phone_number"], "msg": "Value error, Enter a valid South African cellphone number: 10 digits starting with 06, 07 or 08, e.g. 082 123 4567.", "type": "value_error" } ] }
```

Strip the leading `Value error, ` and show the rest under the input. Checking the
same rule in the form before submitting is welcome, but the backend is the one
that decides — keep the player on the phone step whenever this call is not `200`.

`PATCH /api/v1/sessions/{session_id}/contact/email`

```json
{ "email": "thandi@example.com" }
```

Both return the updated `SessionOut` (which includes `phone_number`, `email` and
`marketing_consent`).

Semantics & validation:
- **Works after finish.** Unlike answers/photo, these accept `COMPLETED` sessions
  (that's the expected moment to call them). Only `ABANDONED` → `409`.
  Re-submitting replaces the stored value.
- **Phone is locked after a spin.** Once `POST /sessions/{id}/spin` has succeeded
  (§7.2), `PATCH …/contact/phone` returns `409` with
  `detail: "Phone number is locked after the prize spin."` (the prize is recorded
  against that number). **Collect and submit the phone number BEFORE the spin**, and
  hide/disable the phone input after it. Email is not locked and can still be added
  afterwards.
- **Marketing consent** travels with the phone number and is locked with it. It is
  stored as `false` until you send `true`, and it is passed on to Discovery with the
  spin: follow-up marketing messages are only sent to players who opted in. Send the
  checkbox value as a real JSON `true`/`false` (a string such as `"true"` is `422`);
  omit the field to leave the stored answer unchanged. **Never send `true` unless
  the player ticked an explicit opt-in** — the prize message itself is sent either way.
- **Phone:** user-friendly formatting is accepted — spaces, dashes, dots and
  parentheses are stripped server-side — but the result must be 7–15 digits with
  an optional leading `+` (E.164 style). Stored and returned normalized, e.g.
  `"+27 82 123-4567"` → `"+27821234567"`. Anything else → `422`.
- **Email:** RFC-validated server-side (max 254 chars); the domain part comes
  back lowercased. Invalid address → `422`.
- On `422`, `detail` is FastAPI's standard validation list
  (`[ { "msg": "…", … } ]`) — surface `msg` next to the input. A plain HTML5
  `type="email"`/`type="tel"` input plus these server messages is enough; no
  client-side duplication of the rules is required.

### 3.11 Identity capture — `PATCH …/identity`

The rest of the "call me back" form: name, surname, and an ID/passport toggle
with its number. Collected on the same results screen as §3.10.

`PATCH /api/v1/sessions/{session_id}/identity`

```json
{
  "first_name": "Thandi",
  "last_name": "Mokoena",
  "id_type": "ID",
  "id_number": "9001015800088"
}
```

Returns the updated `SessionOut`.

Semantics & validation:
- **Every field is optional** — send only what the form filled in. Omitted fields
  are left untouched, so the surname can be saved now and the ID number later.
  A payload with nothing in it → `422`.
- **`id_type` and `id_number` must be sent together.** One without the other →
  `422` (`"id_type and id_number must be supplied together."`). `id_type` is
  `"ID"` or `"PASSPORT"` and is what the radio toggle maps to.
- **`first_name` can be set here**, not just at `POST /sessions` (§3.2) — the form
  collects it long after the session was started at onboarding, and there was
  previously no way to correct it.
- **`id_type: "ID"`** → a South African ID number: exactly 13 digits (spaces and
  dashes are stripped), a valid `MMDD` birth date, citizenship digit `0` or `1`,
  and a correct **Luhn check digit**. A single mistyped digit is rejected, so
  surface the `422` message rather than assuming the number was accepted.
- **`id_type: "PASSPORT"`** → 6–20 letters and digits, spacing stripped and
  uppercased (`"a123 4567"` → `"A1234567"`). No checksum — passport formats vary
  by issuing country.
- **Never locked.** Unlike the phone number (§3.10) this stays editable after a
  prize spin; the award is keyed to the phone, not to the document.
- Only `ABANDONED` sessions are rejected (`409`); `COMPLETED` is the expected
  moment to call this.
- **The number is not readable back.** The response carries `id_type` and
  `id_number_masked` (`"•••••••••0088"`), never `id_number` — identity numbers
  are encrypted at rest under POPIA and this endpoint is unauthenticated. Keep
  the value in your own form state if the screen needs to redisplay it.
- On `422`, `detail` is FastAPI's standard validation list — surface `msg` next
  to the input.
- **Rate limited: 10 calls per minute per IP.** Beyond that → `429` with a
  `Retry-After` header (seconds). This endpoint is unauthenticated and stores
  identity documents, so it is capped more tightly than §3.10. Debounce the
  save button rather than firing a PATCH on every keystroke.

---

## 4. Question-by-question tracking & resume

- Every answered question is persisted server-side immediately via §3.3, so the
  session's answer state always survives on the server.
- The only thing the frontend must persist locally (e.g. `sessionStorage`) for a
  session is the session `id`. Everything else — answers so far, completion state,
  results, prize — can be recovered from `GET /sessions/{id}` (§3.6). "Where the user
  is" = the first question (in your client-side ordered list) whose `question_code`
  is absent from `answers`. (The kiosk device token, §6.2, is the one other persisted
  value, and it lives in `localStorage` because it must outlive sessions.)
- If the `id` is lost, start a fresh session (§3.2); abandoned sessions require no
  cleanup call (`ABANDONED` exists as a status but no client endpoint sets it — just
  drop the id).

---

## 5. Photo & generated images (optional part of the experience)

The user can take/upload a selfie **or pick a pre-made avatar** (for users who
prefer not to be photographed). On the selfie path the backend generates a
"with insurance" / "without insurance" image pair in the background (ready by the
time the quiz finishes); on the avatar path the pair is **pre-generated and served
instantly** (§3.8).

**Avatar path (no upload):** show the 9 avatars from `GET /avatars?race=…&gender=…`
(§3.7) as a picker — let the user switch race/gender to load a different set of 9 —
then `PATCH /sessions/{id}/photo/avatar` with the chosen `id` (§3.8). Done; skip the
three steps below. `/images` is already `READY` — the first fetch returns both URLs,
so the "developing…" state is never shown on this path (shared polling code still
works, it just resolves on the first call).

**Selfie path — three steps:**

**Step 1 — presign.** `POST /api/v1/sessions/{id}/photo/presign`

```json
{ "content_type": "image/jpeg" }
```

Allowed: `image/jpeg`, `image/png`, `image/webp` (anything else → `422`).
Response: `{ "object_key": "…", "upload_url": "https://…presigned…" }`.

**Step 2 — upload directly to storage (not the API).** HTTP `PUT` the raw image bytes
to `upload_url` with header `Content-Type` set to the **same value** used in step 1.
No JSON wrapper, no auth header. The URL expires in **10 minutes** — presign, upload,
and confirm in one user interaction; if it expires, presign again.

**Step 3 — confirm.** `PATCH /api/v1/sessions/{id}/photo/confirm`

```json
{ "object_key": "…the key from step 1…" }
```

Returns `SessionOut`; `422` if the upload never landed, or if the key was not
issued for this session (always send back the exact `object_key` from step 1 —
keys are session-scoped). Confirming (re)starts image generation — re-confirming
a new photo supersedes the previous pair.

**Retrieve results — poll:** `GET /api/v1/sessions/{id}/images`

```json
{ "status": "GENERATING", "with_insurance_url": null, "without_insurance_url": null }
```

Poll every ~2–3 seconds (e.g. during the final questions or on the results screen)
until `status` is `READY`, then render both URLs with their headings/subtext:

```json
{
  "status": "READY",
  "with_insurance_url": "https://…",
  "without_insurance_url": "https://…",
  "heading_with": "You made time. Before you had to.",
  "heading_without": "Too busy to be sick. Until you weren't.",
  "subtext_with": "One visit. Under R50 out of pocket.",
  "subtext_without": "3 days in hospital. R12,000 gone."
}
```

The four text fields are admin-editable copy for the two scenario cards (heading
above/below each image, subtext beneath). They are only populated when `status`
is `READY` and may be `null` — fall back to static copy if so. Render them as
**text** (e.g. `textContent`), never as HTML.

- `PENDING` = no photo was ever confirmed; `FAILED` = generation errored (show a
  graceful fallback, do not block the results screen on images).
- The URLs are presigned and **expire in 10 minutes** — fetch fresh URLs from this
  endpoint when (re)rendering rather than storing old ones.
- `GET /api/v1/sessions/{id}/photo` → `{ "url": "…" }` returns a fresh presigned URL
  for the session's photo — the original selfie, **or the chosen avatar image** on
  the avatar path (`404` only if the session has neither). Use this to re-display
  the user's photo/avatar later in the funnel instead of re-fetching the catalog.

---

## 6. Kiosk mode — device pairing & lifecycle

The activation runs on tablets in five Clicks stores. Each tablet is a **kiosk**: a
device record created by an admin, attached to a **location** (store). A kiosk has to
be **paired** once to obtain its device token; from then on it identifies itself with
the `X-Kiosk-Token` header (§1) and reports in with a periodic **heartbeat** so the
admin can see it online and push per-device config.

Everything in this section applies to the kiosk build only. A web visitor's browser
never calls any `/kiosks/*` endpoint and never holds a device token.

### 6.1 `POST /api/v1/kiosks/pair` — pair this device

An admin generates a pairing code for a specific kiosk in the admin UI. The code is
`XXXX-XXXX` (§1 code formats) and **single-use**. It stays the same until a tablet
pairs with it, the kiosk is revoked, or an admin deliberately issues a new one, and it
expires after a server-configured period (production: 30 days; the admin shows the
exact expiry next to each code). The code reaches the tablet one of two ways — support both:

1. **Deep link:** the admin opens the kiosk URL with `?pair=7K3M-9Q2A` on the tablet.
   On load, if `pair` is in the query string and no device token is stored, prefill
   and submit automatically. Immediately remove the parameter from the address bar
   (`history.replaceState`) so a reload does not resubmit a now-used code (that would
   `404`).
2. **Manual entry screen:** the unpaired screen (§6.5) shows an 8-character input
   (upper-case, dash inserted automatically after 4 characters, only the allowed
   alphabet) and a "Pair" button.

No auth header. Body:

```json
{ "pairing_code": "7K3M-9Q2A" }
```

The server upper-cases the value and strips whitespace before matching, so `7k3m-9q2a`
and `7K3M 9Q2A` pair too; anything that does not resolve to `XXXX-XXXX` in the
allowed alphabet is `422`. Send the code as displayed.

Response `200` — `KioskPairOut`:

```json
{
  "device_token": "kt_Q4vX9bJ2LmN8pRtW6yZ1aC3eF5gH7iK0oU-sD_qA4wB",
  "kiosk": {
    "id": "c1a2b3d4-…-uuid",
    "name": "Sandton City — entrance tablet",
    "status": "ACTIVE",
    "location": { "id": "9e8d7c6b-…-uuid", "name": "Clicks Sandton City", "code": "clicks-sandton-city" }
  },
  "config": { "heartbeat_seconds": 60, "idle_timeout_seconds": 90 }
}
```

- **`device_token` is shown exactly once.** The server keeps only a hash; there is no
  endpoint to read it back. Persist it immediately (§6.2). If the write fails, the
  admin has to generate a new pairing code.
- `kiosk.name` is the admin's label for the device; `kiosk.location.name` is the
  store — both are safe to show on the attract screen / a small "paired" badge.
- `config` is the effective per-device configuration (§6.4) — apply it right away.

Errors:
- `404` `detail: "Pairing code not found or expired."` — wrong code, already used,
  or expired. Show the message and let the operator try again / ask an admin to
  check the code.
- `422` — the value is not a well-formed pairing code (standard validation list; show
  "Enter the 8-character code as XXXX-XXXX").
- `429` — more than **5 pairing attempts per minute** from this device's network
  address. Read `Retry-After` (seconds), show "Too many attempts — try again in N
  seconds", and disable the button until then.

Pairing does **not** invalidate a token held by another tablet for the same kiosk
record until the admin explicitly revokes it — this is what lets a tablet be swapped
without downtime. It is not something the frontend needs to handle.

### 6.2 Storing the device token

- Store `device_token` in **`localStorage`** under a single well-known key (e.g.
  `flx_kiosk_token`), together with `kiosk` and `config` so the attract screen can
  render before the first network call. This is the **only** place in the whole
  frontend where a long-lived credential is stored, and it identifies the **device**,
  not a person — it must never be shown on screen, logged, put in a URL, or sent
  anywhere other than the `X-Kiosk-Token` header to the API base URL.
- "Am I a kiosk?" = "is there a token in `localStorage`". No token → behave exactly as
  the public web build (no header, no spin), except that a dedicated kiosk URL / build
  should show the unpaired screen (§6.5) instead of the public start screen.
- Session ids continue to live in `sessionStorage` (§4). Never put the session id in
  `localStorage` — the next shopper must not resume the previous shopper's session.

### 6.3 `GET /api/v1/kiosks/me` — validate on boot

Header `X-Kiosk-Token`. No body, no query params. Call once on every app boot / full
reload before showing the attract screen.

Response `200` — `KioskMeOut`:

```json
{
  "kiosk": {
    "id": "c1a2b3d4-…",
    "name": "Sandton City — entrance tablet",
    "status": "ACTIVE",
    "location": { "id": "9e8d7c6b-…", "name": "Clicks Sandton City", "code": "clicks-sandton-city" }
  },
  "config": { "heartbeat_seconds": 60, "idle_timeout_seconds": 90 },
  "server_time": "2026-08-26T09:12:44Z"
}
```

- Replace the cached `kiosk` and `config` with these values.
- `kiosk.status` `"DISABLED"` → show the disabled screen (§6.5); the call itself still
  succeeds so a disabled device can learn its state.
- `server_time` is the server's current UTC time — useful to log clock drift on the
  tablet; nothing in the flow depends on it.
- `401` → token invalid/revoked → clear it and show the unpaired screen (§6.5).
- Network failure on boot → keep the cached values, show the attract screen, and let
  the heartbeat loop (§6.4) sort it out. Do not clear the token on a network error —
  only on `401`.

### 6.4 `POST /api/v1/kiosks/heartbeat` — keep-alive & config pull

Header `X-Kiosk-Token`. Send every **`config.heartbeat_seconds`** seconds (default
**60**) for as long as the app is open, regardless of which screen is showing, starting
right after boot. The admin's device list marks a kiosk **offline** once it has missed
about three consecutive heartbeats, so keep the timer running through the quiz and the
attract loop alike (a `setInterval` re-armed whenever `heartbeat_seconds` changes).

Body:

```json
{ "app_version": "1.2.0", "screen": "attract" }
```

- `app_version` — a version string for the deployed frontend build (max 40 chars);
  shown to admins to spot stale tablets. Use whatever your build pipeline stamps.
- `screen` — a short identifier for what is on screen right now, for the admin's
  status view: use `attract`, `quiz`, `photo`, `results`, `spin`, `prize`,
  `unpaired`, `disabled`. Free text (max 40 chars), but keep to that set.

Response `200` — `KioskHeartbeatOut`:

```json
{
  "status": "ACTIVE",
  "config": { "heartbeat_seconds": 60, "idle_timeout_seconds": 90 },
  "server_time": "2026-08-26T09:13:44Z"
}
```

- `status` is the `KioskStatus` set by the admin. `"DISABLED"` → stop starting new
  sessions and show the disabled screen (§6.5). Keep heartbeating while disabled —
  the next `"ACTIVE"` re-enables the device without a reload.
- `config` — **always apply it**; admins tune these per device without a deploy:
  - `heartbeat_seconds` (integer, default 60) — re-arm the heartbeat timer if changed.
  - `idle_timeout_seconds` (integer) — seconds of no touch input after which the kiosk
    drops the current session (just discard the id — no server call) and returns to the
    attract screen. Apply on every screen, including the "check your WhatsApp"
    screen after the spin (nothing on it needs noting down).
  Both keys are always present; treat any additional keys as optional and ignore
  unknown ones.
- `401` → token revoked → clear the token, show the unpaired screen, stop the loop.
- Any other failure (network, `5xx`) → ignore and try again at the next tick; never
  clear the token on those.

### 6.5 Kiosk screens & error handling

| Situation | What the kiosk shows |
|---|---|
| No token stored (first boot, or after a `401`) | **Unpaired screen**: "This device isn't paired" + manual code entry (§6.1). Nothing else is reachable. |
| Any kiosk call returns `401` | Clear `localStorage` token, abort the current session (drop its id), show the unpaired screen. |
| `/me` or heartbeat says `status: "DISABLED"`, or `POST /sessions` returns `403` | **Disabled screen**: "This kiosk is temporarily disabled" (static, no input). Keep heartbeating; return to the attract screen when `status` is `"ACTIVE"` again. |
| `429` on pairing | Show the countdown from `Retry-After`; keep the entry form. |
| Network down | Keep the current screen and cached config; heartbeat retries on schedule. Do not treat as unpaired. |

### 6.6 What the kiosk sends the header on

Send `X-Kiosk-Token` on **exactly** these calls:

| Call | Why |
|---|---|
| `POST /api/v1/sessions` (§3.2) | binds the session to the kiosk + store (`channel: "KIOSK"`) — without it the session is `WEB` and can never spin |
| `POST /api/v1/sessions/{id}/spin` (§7.2) | proves the spin comes from the same kiosk that started the session |
| `GET /api/v1/kiosks/me`, `POST /api/v1/kiosks/heartbeat` (§6.3/§6.4) | the device's own calls |

Every other endpoint (quiz, answers, preview, finish, photo, images, contact,
`/prizes/wheel`, `/sessions/{id}/prize`) is called **without** the header, exactly as on
the web. Sending it there is harmless but unnecessary.

---

## 7. "Spin for your Clicks reward" — the prize wheel

Kiosk-only. After the quiz, once the shopper's phone number is captured, they spin a
wheel for one of six physical in-store prizes (or a consolation segment). **The
server decides the outcome and does not tell the kiosk what it was.** The prize and
its **claim code** are sent to the shopper's WhatsApp (via Discovery) within seconds
of the spin; store staff hand the prize over against that code. The frontend's job
is the spin moment and a "check your WhatsApp" screen — it never shows a prize or a
code.

> **Changed:** `POST /spin` and `GET /prize` used to return the prize, the wheel
> segment to land on and the claim code. They no longer do — see §7.2. Any UI that
> reads `prize`, `segment_index`, `is_consolation`, `claim_code`, `expires_at` or
> `instructions` from these responses must be removed.

Order of events on the results screen (kiosk):

```
finish (§3.5) → results + images → PATCH …/contact/phone (§3.10, required)
   → tap "Spin" → POST /sessions/{id}/spin → wheel animation → "check your WhatsApp" screen
```

Web sessions never see the wheel: `POST /spin` on a `WEB` session is `409`.

### 7.1 `GET /api/v1/prizes/wheel` — wheel layout

Public, no header, no session. Fetch once at boot (kiosk build) and re-fetch once a
day; the layout only changes when an admin edits prize types.

Response `200` — `WheelOut`:

```json
{
  "segments": [
    { "index": 0, "code": "PHONE_CARD_HOLDER", "label": "Phone card holder", "color": "#C6E84A", "is_consolation": false, "image_url": null },
    { "index": 1, "code": "WATER_BOTTLE",      "label": "Water bottle",      "color": "#2E7D32", "is_consolation": false, "image_url": null },
    { "index": 2, "code": "FIRST_AID_KIT",     "label": "First aid kit",     "color": "#C6E84A", "is_consolation": false, "image_url": null },
    { "index": 3, "code": "PILL_BOX",          "label": "Pill box",          "color": "#2E7D32", "is_consolation": false, "image_url": null },
    { "index": 4, "code": "GYM_BALL",          "label": "Gym ball",          "color": "#C6E84A", "is_consolation": false, "image_url": null },
    { "index": 5, "code": "CLICKS_VOUCHER",    "label": "Clicks voucher",    "color": "#2E7D32", "is_consolation": false, "image_url": null },
    { "index": 6, "code": "TRY_AGAIN",         "label": "Try again",         "color": "#9E9E9E", "is_consolation": true,  "image_url": null }
  ]
}
```

- **Draw the wheel with exactly these segments, in `index` order**, equal-sized,
  clockwise from the pointer. Do not hard-code the seven above — the count, order,
  labels and colours are admin data. `index` values are `0…n-1` with no gaps.
- The consolation segment (`is_consolation: true`, at most one) is an ordinary segment
  on the wheel — draw it like the others. Its `label` is the on-wheel copy.
- `color` is a CSS hex colour (`#RRGGBB` or `#RRGGBBAA`) chosen by the admin for the
  segment fill; `label` is short wheel copy (≤ 60 chars) — render as text.
- `image_url` is `null` unless an admin uploaded an icon; when present it is a
  presigned URL that **expires in ~10 minutes** (same rule as §3.7). If you render
  icons, re-fetch the wheel when the spin screen is shown rather than at boot;
  labels/colours can still come from the boot-time copy.
- `503` / network failure → the wheel can't be drawn; show the fallback copy from
  §7.4 in place of the spin screen and still let the flow complete.

### 7.2 `POST /api/v1/sessions/{session_id}/spin` — spin

Header `X-Kiosk-Token` (required — §6.6). No body. Preconditions, all enforced
server-side: session is `channel: "KIOSK"`, was started on **this** kiosk, is
`COMPLETED`, and has a `phone_number`.

Response `200` — `PrizeAwardOut` (a receipt that the spin was recorded):

```json
{
  "award_id": "5d6e7f80-…-uuid",
  "status": "AWARDED",
  "awarded_at": "2026-08-26T09:20:31Z",
  "delivery_channel": "WHATSAPP",
  "location": { "id": "9e8d7c6b-…", "name": "Clicks Sandton City", "code": "clicks-sandton-city" },
  "first_name": "Thandi"
}
```

Field notes:
- There is deliberately **no prize, no `segment_index`, no claim code** and no
  indication of whether the spin won a physical prize or the consolation. Do not
  try to derive it.
- `status` is always `"AWARDED"` from this call (see §7.3 for the others). It means
  "the spin is recorded", for consolation spins too.
- `delivery_channel` — where the shopper's prize details are sent. Always
  `"WHATSAPP"` today.
- `location` — the store the session belongs to (where any prize is collected).
- `first_name` — the session's first name at spin time, `null` if not collected.

**Animation contract:**
1. On tap, disable the button and start the wheel spinning immediately — do not
   wait for the response.
2. Fire the request. When `200` arrives, wind the animation down and move to the
   "check your WhatsApp" screen. **The wheel must not come to rest in a way that
   points at a segment as the result** — the kiosk does not know the result, and a
   segment under the pointer would contradict the WhatsApp message. Blur/fade the
   wheel out while it is still turning, or cover it with the confirmation.
3. If the response is slow, keep spinning — there is no client-side timeout shorter
   than ~20 s.
4. On any error, stop the wheel and show the copy from §7.4.
5. "Check your WhatsApp" screen: tell the shopper their reward details are on their
   way to the number they entered (use `first_name` and the store name if you
   like), and that they show the WhatsApp message to a Flexicare promoter in store.
   No prize name, no code.

**Idempotent:** the server records exactly one award per session. Re-calling
`POST /spin` for a session that already has an award returns `200` with the **same**
receipt (same `award_id`) — so it is safe to re-call after a network drop, a
double-tap, or a reload mid-animation. Do not treat a second `200` as a second prize;
the shopper is only messaged once.

**One spin per person:** the phone number captured in §3.10 is the identity. A
number that already has a non-voided award anywhere in the campaign cannot spin
again (`409`, §7.4) — the wheel should not start in that case; show the "already
spun" copy instead. After a successful spin the phone number is locked (§3.10).

### 7.3 `GET /api/v1/sessions/{session_id}/prize` — resume / re-show the reward

No header, no body. Returns the same receipt as §7.2 (never the prize or claim
code), with `status` reflecting the award's current state:

| `status` | Meaning | Show |
|---|---|---|
| `AWARDED` | spin recorded, prize not yet collected | the "check your WhatsApp" screen |
| `REDEEMED` | staff have handed the prize over | the same screen, or a "collected" state |
| `EXPIRED` | the claim code expired before redemption | the same screen is fine — the WhatsApp message carries the detail |
| `VOIDED` | cancelled by an admin | "This reward is no longer valid" |

- `404` `detail: "No prize for this session."` — the session has never spun (or is
  unknown). On resume this means: offer the spin (kiosk, `COMPLETED`, phone captured)
  or nothing (web).
- Use together with `has_prize` from §3.6: on reload of a completed kiosk session,
  `has_prize: true` → the shopper has already spun, show the "check your WhatsApp"
  screen; `false` → show results with the spin CTA.

### 7.4 Spin errors — exact `detail` strings and what to do

Branch on the status code first, then on `detail` where one code has several causes.

| Code | `detail` | Cause | UI |
|---|---|---|---|
| `401` | (any) | `X-Kiosk-Token` missing, invalid or revoked | Clear token, drop session, unpaired screen (§6.5) |
| `403` | `"Kiosk is disabled."` | this kiosk is `DISABLED` | Disabled screen (§6.5) |
| `403` | (any other) | session was started on a **different** kiosk than the one spinning | "Please spin on the tablet where you took the quiz" — cannot be recovered on this device |
| `404` | `"Session not found."` | unknown `session_id` | Start over (§4) |
| `409` | `"Spins are only available on in-store kiosks."` | session `channel` is `WEB` | Never show the wheel for web sessions; if reached, hide the spin CTA |
| `409` | `"Session is not completed."` | `POST /finish` hasn't succeeded yet | Finish first (§3.5), then retry |
| `409` | `"Phone number required before spinning."` | no `phone_number` on the session | Show the phone input (§3.10), then retry |
| `409` | `"This phone number has already spun."` | the number already holds a prize (this campaign, any store, any session) | "Looks like you've already spun — one reward per person." No wheel |
| `409` | (any other) | session has no store (should not happen for a kiosk session) | Fallback copy below |
| `429` | (any) | more than **10 spins per minute** from this kiosk | Honour `Retry-After` (seconds); keep the spin CTA disabled until then |
| `503` | (any) | the prize wheel is not configured on the server | Fallback copy below — do **not** block the results screen |

**Fallback copy** (network failure, `503`, unexpected `409`/`5xx`): "We couldn't spin
the wheel right now — please ask a Clicks team member." The shopper keeps their
results and images; nothing else in the flow depends on the spin.

**Not the frontend's job:** right after the spin the backend sends the reward
(prize, claim code, store) to Discovery, which messages the captured phone number on
WhatsApp. The backend retries on its own if that fails. There is no endpoint to
trigger it and nothing to render for it beyond the "check your WhatsApp" screen.

---

## 8. Implementation checklist for the agent

1. On app load / quiz start: `POST /sessions` (pass `language`, and `first_name` /
   `gender` if collected on an intro screen) → store `id`.
2. `GET /quiz?lang=<language>` once → split into `ROUTING` (archetype `null`) and
   `FLEX` (grouped by `archetype`), each sorted by `position` (already sorted server-side).
3. Render ROUTING questions one at a time. On each selection:
   `POST /sessions/{id}/answers` with that single answer; keep the answer in local
   state too. If the question has `drives_echo: true`, also store the chosen option's `label`.
4. After the last ROUTING answer: `POST /routing/preview` with all routing answers →
   take `archetype`.
5. Render only the FLEX questions where `question.archetype === previewedArchetype`,
   one at a time, submitting each answer as in step 3.
6. Back-navigation: re-submit the changed answer (upsert). If a ROUTING answer changes,
   re-run the preview (step 4) — the archetype may change, which changes which FLEX
   questions apply; previously stored FLEX answers for another archetype are harmless
   to the final score only if the user re-answers correctly, so on archetype change the
   safest path is to restart FLEX with a fresh preview or start a new session.
7. After the last FLEX answer: `POST /sessions/{id}/finish` → render results from the
   response (archetype label, product label, price = `recommended_price_cents / 100`).
8. Photo flow (§5) can run at the start (recommended, so selfie generation is ready
   by finish); offer both "take a photo" and "choose an avatar" (§3.7/§3.8). The
   selfie path generates in the background (poll `/images`); the avatar path serves
   pre-generated images (`/images` is `READY` on the first call). Either way, render
   the returned headings/subtext with the image pair on the results screen.
9. On the results screen, offer phone and email inputs (both optional on the web;
   phone required before the spin on a kiosk) and submit the filled ones via §3.10 —
   these work after finish; show the `422` `msg` inline if validation rejects a value.
   Collect the phone **before** the spin; it is locked (`409`) afterwards.
   **Next to the phone input, show a marketing opt-in checkbox, unticked by default**
   (e.g. "Discovery may send me offers and updates on WhatsApp"), and send its value
   as `marketing_consent` (`true`/`false`) in the same `PATCH …/contact/phone` call.
   Always send the field, so a "no" is recorded as an answer rather than left unset.
10. On page load with a stored session `id`: `GET /sessions/{id}` → if `COMPLETED`,
    show results from that payload (and, if `has_prize`, the "check your WhatsApp"
    screen, §7.3); if
    `IN_PROGRESS`, resume from the first unanswered question (§4).
11. Handle `409` on any answers/finish call by fetching `GET /sessions/{id}` and
    treating the session per its actual `status`; treat `422` as a client bug (bad
    codes) — log and surface `detail`.

**Kiosk mode (§6):**

12. First boot / no token in `localStorage`: show the unpaired screen; accept
    `?pair=XXXX-XXXX` (auto-submit, then strip from the URL) or manual entry →
    `POST /kiosks/pair` → persist `device_token`, `kiosk`, `config`. Handle `404`
    (bad/expired code), `422` (format), `429` (`Retry-After` countdown).
13. Every boot with a token: `GET /kiosks/me` → refresh `kiosk`/`config`; `401` →
    clear token → unpaired screen; `status: "DISABLED"` → disabled screen.
14. Heartbeat loop: `POST /kiosks/heartbeat` `{ app_version, screen }` every
    `config.heartbeat_seconds` (default 60), on every screen, for the life of the app.
    Apply returned `config` (re-arm the timer; use `idle_timeout_seconds` for the
    attract-screen reset). `401` → unpaired screen; `status: "DISABLED"` → disabled
    screen (keep heartbeating; `ACTIVE` restores the attract screen).
15. Send `X-Kiosk-Token` on `POST /sessions` and `POST /sessions/{id}/spin` only.
    `POST /sessions` `401` → unpaired screen (never fall back to a header-less session);
    `403` → disabled screen.
16. Idle timeout: after `idle_timeout_seconds` without touch, drop the session id and
    return to the attract screen (no server call needed).

**Spin (§7, kiosk only):**

17. Boot: `GET /prizes/wheel` → build the wheel from `segments` in `index` order
    (re-fetch daily; re-fetch on the spin screen if you render `image_url` icons).
    `503`/failure → skip the wheel, show fallback copy, don't block.
18. After `PATCH …/contact/phone` (with `marketing_consent`, §3.10) succeeds on a
    `COMPLETED` kiosk session, enable the spin CTA. On tap: start spinning,
    `POST /sessions/{id}/spin` with the header; when the response arrives, fade the
    wheel out without landing on a segment (the response carries no result); keep
    spinning while waiting; stop and show fallback copy on error.
19. After the spin: the "check your WhatsApp" screen — reward details are on their
    way to the number entered, show the message to a Flexicare promoter in store. No
    prize name and no claim code are available to show. Hide the phone input from
    here on (it is locked).
20. Resume: `has_prize: true` on `GET /sessions/{id}` → show the "check your
    WhatsApp" screen (optionally `GET /sessions/{id}/prize` for `status`, §7.3).
    Retrying `POST /spin` is safe — it returns the same receipt and does not message
    the shopper again. Handle every row of the §7.4 error table by status code, then
    `detail`.

---

## 9. Copy rewrite v3 (Nov 2026) — what is left for the frontend

Checked against the test site on 17 Nov 2026. The landing, avatar/selfie choice, avatar
select, registration, "What is Flexicare", reveal, recommendation and spin screens
already carry the new copy. Still open:

1. **Gender pills on registration:** add "Prefer not to say" and send
   `gender: "prefer_not_to_say"` (§3.2). The avatar picker is unchanged.
2. **Send consent with the phone number:** the form requires the consent tick but
   `PATCH …/contact/phone` currently sends only the number, so every player is recorded
   as not consenting. Send `marketing_consent: true` when the box is ticked (§3.10).
3. **"What is Flexicare" screen:** the line "Most people assume Flexicare is medical aid
   with a different name. It isn't." is missing, and the badge reads "What is
   flexicare?" (lower-case f).
4. **Recommendation screen:** the QR section from the rewrite is not there ("Scan to get
   your full [Flexicare Core / Flexicare Plus] breakdown on WhatsApp.", "Scan first.
   Then spin.", button "I've scanned. Let me spin."). The QR currently sits on the spin
   page after the spin. Confirm with the client which order they want.
5. **Reveal screen:** one label still reads "Without Cover"; it should be "Without
   Flexicare".
6. **Recommendation screen echo slot:** no question drives the echo any more
   (`drives_echo` is false on all of them), so `[data-product-echo]` / `{echo}` is
   empty. Remove the slot or rewrite the line without it.
7. **Spin page:** `POST /spin` no longer returns `segment_index` or `claim_code` (§7.2).
   The current script copes by stopping the wheel where it is and showing the WhatsApp
   panel; replace the landing animation with the fade-out described in §7.2.

**The quiz changes without a frontend release.** `GET /quiz` now returns six routing
questions instead of five (in order: cost delay, clinic or private, the "moment"
question, age, dependants, chronic conditions) and new wording for the Carrier's three
flex questions. Retired questions are no longer returned. Nothing should assume five
routing questions or particular question codes: build progress ("Question n of N") and
the "all routing questions answered" check from the list the API returns.

