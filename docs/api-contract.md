# Flexicare Quiz — Backend API contract (frontend handover)

> Supplied by the backend developer. This is the authoritative contract for the
> session/quiz/photo flow. Swagger UI: `https://api-staging-discovery.injozitech.com/docs`
> (staging only — disabled in production).
>
> **Base URL is configured in one place:** `Flexicare.config.apiBase` in
> `src/flexicare-core.js` (currently STAGING — swap before go-live).

---

## 1. Fundamentals

- **Base URL (staging):** `https://api-staging-discovery.injozitech.com`; all routes are
  prefixed `/api/v1` (already baked into `FC.config.apiBase`, so `FC.api("/sessions")`
  is the full call).
- **Authentication: NONE.** `POST /sessions` returns a UUID `id`; that UUID *is* the
  credential, passed as a path param on every later call. Treat it as a secret — memory /
  `sessionStorage` only, never logged. (`FC.getSessionId()` / `FC.setSessionId()`.)
- **Content type:** JSON everywhere except the raw photo `PUT` (§5).
- **Errors:** FastAPI shape `{ "detail": "<message>" }`.
  - `404` unknown `session_id`
  - `409` session-state conflict (answering/finishing a session that is not
    `IN_PROGRESS`, or finishing twice)
  - `422` validation (unknown question/option code, option not in question, empty
    answers list, unsupported image type)
- **CORS:** wide open during development; will be locked to the production origin before
  go-live. No cookies/credentials involved, so nothing changes on the frontend.

### Enums (exact, case-sensitive)

| Enum | Values |
|---|---|
| `Language` | `en`, `zu`, `st`, `af` (only `en` is fully populated; others may return blank strings) |
| `QuizStage` | `ROUTING`, `FLEX` |
| `ArchetypeCode` | `A`, `B`, `C` |
| `ProductCode` | `CORE`, `PLUS` |
| `SessionStatus` | `IN_PROGRESS`, `COMPLETED`, `ABANDONED` |
| `ImageStatus` | `PENDING`, `GENERATING`, `READY`, `FAILED` |
| `AvatarRace` | `black`, `white`, `indian`, `asian`, `coloured` |
| `AvatarGender` | `male`, `female` |
| `AvatarAgeGroup` | `young_adult`, `middle_aged`, `elder` |

---

## 2. The flow at a glance

```
1. POST /api/v1/sessions                        -> session id (status IN_PROGRESS)
2. GET  /api/v1/quiz?lang=en                    -> ALL questions + options (one fetch)
3. (optional) photo — EITHER  presign -> PUT to storage -> confirm      (selfie)
                      OR      GET /avatars -> PATCH .../photo/avatar    (avatar picker)
                      (selfie generates in the background; the avatar's pair is
                       pre-approved and stored, so /images is READY at once)
4. For each ROUTING question (R01..R05, in position order):
       POST /api/v1/sessions/{id}/answers  { answers: [ {question_code, option_code} ] }
5. POST /api/v1/routing/preview with the routing answers -> archetype (A/B/C)
6. For each FLEX question belonging to that archetype (in position order):
       POST /api/v1/sessions/{id}/answers  (same shape, one at a time)
7. POST /api/v1/sessions/{id}/finish            -> final result (archetype, product, price)
8. Poll GET /api/v1/sessions/{id}/images until READY -> show with/without-insurance images
9. (optional) PATCH .../contact/phone and/or .../contact/email  -> where to send the images

Any time: GET /api/v1/sessions/{id}  -> full session state + stored answers (resume / re-fetch results)
```

**Critical architectural fact:** there is no "current question" / "next question"
endpoint. The frontend fetches the whole question set once and drives progression
itself, persisting each answer as it is chosen. Server-side answer state is always
current; the *UI position* is frontend state.

**Branching:** none server-side. `ROUTING` questions have `archetype: null` and everyone
answers all of them. `FLEX` questions are tagged `A`/`B`/`C` — show **only** those
matching the routing-preview archetype.

---

## 3. Endpoint reference

### 3.1 `GET /api/v1/quiz` — all questions

Query: `lang` (default `en`), `stage` (`ROUTING`|`FLEX`, optional filter — we fetch all
and filter client-side).

`200` — array of questions, already sorted by `(stage, position)`, options by
`position`. **Render in that order; do not re-sort.**

```json
[
  {
    "code": "R02",
    "stage": "ROUTING",
    "archetype": null,
    "position": 2,
    "prompt": "...question text...",
    "helper": "...optional helper text or null...",
    "drives_echo": false,
    "options": [
      { "code": "R02_a", "label": "...", "position": 1 },
      { "code": "R02_b", "label": "...", "position": 2 }
    ]
  }
]
```

- `code` / option `code` are the stable identifiers sent back when answering. Never send
  labels or positions back.
- `archetype` is `null` for ROUTING, `"A"|"B"|"C"` for FLEX — the field FLEX filters on.
- `drives_echo: true` marks the one question (R03) whose chosen option *label* the
  frontend stores and echoes into later copy (`Flexicare.echo`).

### 3.2 `POST /api/v1/sessions` — start a session

Body (all optional; `{}` is valid): `{ "language": "en", "first_name": "Thandi", "gender": "female" }`

`201` — `SessionOut`:

```json
{
  "id": "3f0b7f6e-...-uuid",
  "status": "IN_PROGRESS",
  "language": "en",
  "first_name": "Thandi",
  "gender": "female",
  "archetype_id": null,
  "tier_score": null,
  "recommended_product_id": null,
  "recommended_price_cents": null,
  "created_at": "2026-07-15T10:00:00Z",
  "completed_at": null
}
```

### 3.3 `POST /api/v1/sessions/{session_id}/answers` — submit answer(s)

Once per question as it is answered (list of one). Batching works but per-question is
what keeps server progress question-by-question.

```json
{ "answers": [ { "question_code": "R02", "option_code": "R02_c" } ] }
```

`200` — updated `SessionOut` (does **not** include stored answers).

- **Upsert per question.** Re-submitting the same `question_code` replaces the choice —
  that is how "go back and change an answer" works. No delete endpoint.
- `409` if the session is not `IN_PROGRESS`. `422` for empty list / unknown codes /
  option not belonging to the question.

### 3.4 `POST /api/v1/routing/preview` — determine archetype mid-session

Stateless scoring — does not touch the session. Call after the last ROUTING question.

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

`200`:

```json
{
  "archetype": "B",
  "archetype_label": "...localized name...",
  "archetype_scores": { "A": 3, "B": 7, "C": 2 },
  "tiebroken": false,
  "tier_score": 2,
  "product": "CORE",
  "product_label": "..."
}
```

Use **only** `archetype` for branching — `product`/`tier_score` are incomplete until the
FLEX answers are in. `422` on unknown option codes.

### 3.5 `POST /api/v1/sessions/{session_id}/finish` — complete the session

No body. Call after the last FLEX question. The server re-scores **all stored answers**,
persists the result and sets `status = COMPLETED`.

`200` — `SessionFinishOut`:

```json
{
  "session_id": "3f0b7f6e-...",
  "status": "COMPLETED",
  "archetype": "B",
  "archetype_label": "...",
  "archetype_scores": { "A": 3, "B": 7, "C": 2 },
  "tiebroken": false,
  "tier_score": 6,
  "product": "PLUS",
  "product_label": "...",
  "recommended_price_cents": 24900
}
```

- `recommended_price_cents` is an integer in **cents** (÷100 to display) and may be `null`.
- `409` if already completed (idempotency guard — do not retry a successful finish;
  re-fetch with §3.6 instead).
- `422` if scoring fails; surface `detail`.
- The detail endpoint does not include `archetype_scores`/`tiebroken` — those exist only
  on the finish response and are not needed for the results UI.

### 3.6 `GET /api/v1/sessions/{session_id}` — full state (resume / results)

`SessionOut` **plus** stored answers (ordered by `answered_at`) and, once completed, the
resolved recommendation:

```json
{
  "id": "3f0b7f6e-...",
  "status": "IN_PROGRESS",
  "language": "en",
  "first_name": "Thandi",
  "gender": null,
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
  "product_label": null
}
```

After `/finish` the same call returns `status: "COMPLETED"` with `archetype`,
`archetype_label`, `product`, `product_label` and `recommended_price_cents` populated.
`404` for an unknown id.

Use for: **resume** (rebuild answered state, re-run preview to recover the archetype,
continue from the first unanswered question) and **results re-fetch** if the finish
response was lost.

### 3.7 `GET /api/v1/avatars?race=black&gender=male` — avatar catalog

For users who don't want to be photographed: a curated catalog of 9 avatars per
race/gender combination (3 age groups × 3 variants). **Both query params are required**
(`AvatarRace` / `AvatarGender`; `422` on anything else).

```json
{
  "race": "black",
  "gender": "male",
  "avatars": [
    { "id": "8f3656e1-...", "slug": "black-male-young-adult-1", "age_group": "young_adult", "variant": 1, "status": "READY", "url": "https://...presigned..." },
    { "id": "71f49eb5-...", "slug": "black-male-elder-3", "age_group": "elder", "variant": 3, "status": "PENDING", "url": null }
  ]
}
```

- Always exactly **9** entries, ordered `young_adult` → `middle_aged` → `elder`, variants
  1–3 within each — render straight into a 3×3 grid, don't re-sort.
- **`url` is the gate: selectable ⟺ `url` present** — whatever `status` says. A url is
  only issued when the avatar image **and its two approved with/without-insurance
  scenario images** are all ready (the whole catalog, pairs included, is admin-curated),
  so it is the stricter signal; `status` describes the avatar image alone. A slot without
  a url → render a placeholder and **don't let the user select it**.
  `flexicare-avatar.js` gates on `url` and shows `status` in its debug table only.
- `slug` (`{race}-{gender}-{age_group}-{variant}`) is for analytics/debugging; selection
  uses `id` (§3.8).
- The urls are presigned and **expire in ~10 minutes** — re-fetch on every filter change
  and every entry to the picker rather than caching them.

### 3.8 `PATCH /api/v1/sessions/{session_id}/photo/avatar` — select an avatar as the photo

The alternative to §5's presign/upload/confirm. Sets the chosen avatar as the session photo.

**NOTHING IS GENERATED ON THIS PATH.** Every catalog avatar already has an
admin-approved with/without-insurance image pair stored against it; selecting the avatar
copies that pair onto the session. Consequences for us:

- `GET /sessions/{id}/images` (§5) is **`READY` on the very first call**, with both urls
  and the four copy fields. No `GENERATING` phase, no `FAILED` state on this path — the
  reveal page's "developing…" element is a selfie-path state only. Polling anyway is
  harmless (the shared code just resolves on call one), which is why nothing downstream
  branches on the source.
- Everyone who picks the same avatar sees the same approved pair — no AI variance in the
  emotional payoff of the funnel.

```json
{ "avatar_id": "8f3656e1-...the id from §3.7..." }
```

Returns `SessionOut` (same as photo confirm). `404` unknown session or avatar; `409` if
the session isn't `IN_PROGRESS`, or the avatar isn't fully baked — which can't happen if
you only offer avatars with a `url` (§3.7). Selecting an avatar after a photo (or another
avatar) simply supersedes the previous images.

### 3.9 `GET /api/v1/avatars/web` — transparent-background avatars (marketing site)

**The avatar picker calls this** alongside §3.7 and joins the two on `id` — see below.
A separate image set from §3.7: the same 90 catalog slots rendered as
**transparent-background webp**. No session, no auth, no selection — a read-only image
catalog.

All query params are optional filters: `race`, `gender`, `age_group` (same enums as §1).
With none, all 90 slots come back.

```
GET /api/v1/avatars/web?race=indian&gender=female
```

```json
{
  "total": 9,
  "avatars": [
    { "id": "8f3656e1-...", "slug": "indian-female-young_adult-1", "race": "indian", "gender": "female", "age_group": "young_adult", "variant": 1, "url": "https://...presigned..." }
  ]
}
```

- Ordered race → gender → `young_adult` → `middle_aged` → `elder`, variants 1–3.
- **No `status` field** and no generation lifecycle: `url` is simply `null` for a slot
  whose web image hasn't been uploaded yet — skip those.
- Same presigned-url rule as §3.7: **~10 minute expiry**, so these can't be pasted into
  Webflow as static assets — a page using them has to call the API on load and re-fetch.
  `flexicare-avatar.js` already re-fetches on every entry and filter change, so nothing
  extra is needed there; any *marketing* page that wants these needs its own small script.

**How the picker uses it (verified on staging 2026-08-21).** Both endpoints return the
same 9 slots for a race/gender, with the **same `id`s in the same order**, so:

| | `GET /avatars` (§3.7) | `GET /avatars/web` (§3.9) |
|---|---|---|
| owns the `id` we `PATCH` with | **yes** | (same ids) |
| says "pickable" | **`url` present** | no signal |
| image | jpg, white background | **transparent webp** |
| coverage on staging | black/male + black/female only (+1 slot) | **all 90** |

So the picker **displays the transparent render and gates selection on the catalog
`url`**. A slot whose scenario pair isn't approved yet therefore shows its face, dimmed
and unclickable, instead of an empty placeholder. The `/web` call is best-effort: if it
fails, every card falls back to the catalog jpg (and `data-avatar-transparent="off"` on
the wrapper disables it outright).

**Why we can't just select from `/web`:** `PATCH …/photo/avatar` returns `409` for an
avatar that isn't fully baked (§3.8), so offering an unbaked face as pickable would fail
at onboarding and dump that user on the reveal page's fallback images. Displaying it is
safe; selecting it is not. **The fix that removes the second call entirely** is for the
backend to either (a) add the transparent render's url to the §3.7 response, or (b) return
the avatar's own image url always plus a separate `selectable`/`baked` flag — then one call
gives us face + pickability. Worth asking for; not blocking.
- Note the slug here spells the age group with an underscore (`...-young_adult-1`) while
  §3.7's example uses hyphens (`...-young-adult-1`). Cosmetic (we key off `id`), but
  worth confirming with the backend if we ever match slugs across the two endpoints.

### 3.10 Contact capture — `PATCH .../contact/phone` and `.../contact/email`

Two separate endpoints; call whichever the user filled in.

```
PATCH /api/v1/sessions/{session_id}/contact/phone   { "phone_number": "+27 82 123 4567" }
PATCH /api/v1/sessions/{session_id}/contact/email   { "email": "thandi@example.com" }
```

Both return the updated `SessionOut` (which carries `phone_number` / `email`).

- **Not results-screen-only:** they accept `IN_PROGRESS` *and* `COMPLETED` sessions; only
  `ABANDONED` gives `409`. We call `/contact/phone` from `/onboarding`, right after session
  create. Re-submitting replaces the stored value.
- **Phone:** spaces, dashes, dots and parentheses are stripped server-side; the result must
  be 7–15 digits with an optional leading `+`. Stored/returned normalized
  (`"+27 82 123-4567"` → `"+27821234567"`). Else `422`. (`flexicare-onboarding.js`
  normalizes to E.164 before sending anyway.)
- **Email:** RFC-validated, max 254 chars, domain lowercased. Invalid → `422`.
- On `422` the `detail` is FastAPI's validation list (`[ { "msg": "…" } ]`) — surface `msg`
  next to the input.

---

## 4. Question-by-question tracking & resume

- Every answer is persisted immediately (§3.3), so server answer state always survives.
- The only thing the frontend must persist locally is the session `id`. Everything else
  is recoverable from `GET /sessions/{id}`. "Where the user is" = the first question in
  the client-side ordered list whose `question_code` is absent from `answers`.
- If the id is lost, start a fresh session. No cleanup call exists for abandoned
  sessions — just drop the id.

---

## 5. Photo & generated images

A selfie **or** a picked avatar (§3.7/§3.8) puts a "with insurance" / "without insurance"
image pair on the session. **Only the selfie path generates:** it runs in the background
and is ready by the time the quiz finishes (poll `/images`). The avatar path skips the
three steps below entirely — one `PATCH`, and the pre-approved pair is already there, so
the first `/images` call returns `READY` (§3.8).

**Step 1 — presign.** `POST /api/v1/sessions/{id}/photo/presign`
`{ "content_type": "image/jpeg" }` — allowed: `image/jpeg`, `image/png`, `image/webp`
(else `422`). Response: `{ "object_key": "...", "upload_url": "https://...presigned..." }`.

**Step 2 — upload direct to storage (not the API).** `PUT` the raw bytes to `upload_url`
with `Content-Type` set to the **same value** as step 1. No JSON wrapper, no auth header.
The URL expires in **10 minutes** — presign, upload and confirm in one interaction.

**Step 3 — confirm.** `PATCH /api/v1/sessions/{id}/photo/confirm`
`{ "object_key": "...from step 1..." }` — returns `SessionOut`; `422` if the upload never
landed. Confirming (re)starts generation; a new confirm supersedes the previous pair.

**Retrieve — poll** `GET /api/v1/sessions/{id}/images`:

```json
{ "status": "GENERATING", "with_insurance_url": null, "without_insurance_url": null }
```

Poll every ~2–3 s (during the final questions or on the reveal screen) until
`status: "READY"`, then render both urls. A `READY` response also carries admin-editable
copy for the two cards:

```json
{
  "status": "READY",
  "with_insurance_url": "https://...",
  "without_insurance_url": "https://...",
  "heading_with": "You made time. Before you had to.",
  "heading_without": "Too busy to be sick. Until you weren't.",
  "subtext_with": "One visit. Under R50 out of pocket.",
  "subtext_without": "3 days in hospital. R12,000 gone."
}
```

The four text fields may be `null`, and are only populated when `status` is `READY`. If
rendered, render them as **text** (`textContent`), never as HTML. **We currently ignore
them:** the reveal page's per-archetype copy database (a Webflow embed) is the source of
truth for those four slots, because it also does the multi-item cycling. Revisit if the
backend copy needs to be editable without a Webflow publish.

- `PENDING` = no photo was ever confirmed. `FAILED` = generation errored — **selfie path
  only**; neither should occur on the avatar path unless the `PATCH` itself failed (it is
  fire-and-forget from onboarding, so this is possible). Show a graceful fallback,
  **never block the results screen on images**.
- The URLs are presigned and **expire in 10 minutes** — re-fetch from this endpoint when
  (re)rendering rather than storing old ones.
- `GET /api/v1/sessions/{id}/photo` -> `{ "url": "..." }` — fresh presigned URL for the
  session's photo: the original selfie **or the chosen avatar image** on the avatar path
  (`404` only if the session has neither). Use this to re-display the user's face later in
  the funnel rather than re-fetching the whole 9-item catalog for one expired url.

---

## 6. Implementation checklist

1. Quiz start: `POST /sessions` (`language`, plus `first_name`/`gender` if collected) ->
   store `id`.
2. `GET /quiz?lang=<language>` once -> split ROUTING (archetype `null`) / FLEX (grouped
   by archetype), each in server order.
3. Render ROUTING one at a time; on each selection `POST /sessions/{id}/answers` with the
   single answer and keep it in local state. If `drives_echo`, store the option `label`.
4. After the last ROUTING answer: `POST /routing/preview` -> take `archetype`.
5. Render only FLEX questions where `question.archetype === previewedArchetype`.
6. Back-navigation re-submits the changed answer (upsert). If a **ROUTING** answer
   changes, re-run the preview — the archetype may change, which changes the FLEX set;
   safest path on an archetype change is to restart FLEX with a fresh preview (or a new
   session).
7. After the last FLEX answer: `POST /sessions/{id}/finish` -> render results
   (`archetype_label`, `product_label`, price = `recommended_price_cents / 100`).
8. Photo flow runs at the start so images are ready by finish — selfie (§5) *or* avatar
   (§3.7/§3.8), never both; poll `/images` on the reveal screen.
9. On load with a stored id: `GET /sessions/{id}` — `COMPLETED` -> show results;
   `IN_PROGRESS` -> resume from the first unanswered question.
10. `409` on answers/finish -> fetch `GET /sessions/{id}` and act on its actual `status`.
    `422` is a client bug (bad codes) — log and surface `detail`.
