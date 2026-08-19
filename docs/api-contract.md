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

---

## 2. The flow at a glance

```
1. POST /api/v1/sessions                        -> session id (status IN_PROGRESS)
2. GET  /api/v1/quiz?lang=en                    -> ALL questions + options (one fetch)
3. (optional) photo: presign -> PUT to storage -> confirm   (starts background image generation)
4. For each ROUTING question (R01..R05, in position order):
       POST /api/v1/sessions/{id}/answers  { answers: [ {question_code, option_code} ] }
5. POST /api/v1/routing/preview with the routing answers -> archetype (A/B/C)
6. For each FLEX question belonging to that archetype (in position order):
       POST /api/v1/sessions/{id}/answers  (same shape, one at a time)
7. POST /api/v1/sessions/{id}/finish            -> final result (archetype, product, price)
8. Poll GET /api/v1/sessions/{id}/images until READY -> show with/without-insurance images

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

The selfie drives a background "with insurance" / "without insurance" image pair, ready
by the time the quiz finishes.

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

Poll every ~2–3 s (during the final questions or on the results screen) until
`status: "READY"`, then render both URLs.

- `PENDING` = no photo was ever confirmed. `FAILED` = generation errored — show a
  graceful fallback, **never block the results screen on images**.
- The URLs are presigned and **expire in 10 minutes** — re-fetch from this endpoint when
  (re)rendering rather than storing old ones.
- `GET /api/v1/sessions/{id}/photo` -> `{ "url": "..." }` — fresh presigned URL for the
  original selfie (`404` if none).

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
8. Photo flow (§5) runs at the start so images are ready by finish; poll `/images` for
   the results screen.
9. On load with a stored id: `GET /sessions/{id}` — `COMPLETED` -> show results;
   `IN_PROGRESS` -> resume from the first unanswered question.
10. `409` on answers/finish -> fetch `GET /sessions/{id}` and act on its actual `status`.
    `422` is a client bug (bad codes) — log and surface `detail`.
