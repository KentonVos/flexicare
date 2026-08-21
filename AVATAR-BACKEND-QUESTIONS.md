# Avatar selector — questions for the backend

**From:** Kenton (frontend / Webflow)
**Re:** `FRONTEND_HANDOVER.md` §3.7 / §3.8 (avatar catalog + avatar selection) and §3.9 (contact capture)
**Date:** 2026-08-20
**Status (2026-08-21):** the updated handover answers **Q1, Q2, Q3, Q4 and Q9** — all
five the way we hoped. Q5–Q8 are still open (staging catalog coverage, enum stability,
rate limiting, whether the avatar PATCH writes `gender`); none of them block us. The
answers are recorded per question below and folded into `docs/api-contract.md`.

The handover also added a NEW endpoint we didn't ask about: `GET /avatars/web`
(§3.9) — the same 90 slots as transparent-background webp, for the marketing site.
Read-only, no session. We don't call it; see the api-contract note.

Thanks for the handover — it's clear enough to build against. Before I wire up the
avatar picker I need to settle the questions below. Q1 is the important one; the rest
are quick confirmations.

For context, here's how the frontend will use the two new avatar endpoints. Our funnel
takes the photo/avatar step **before** the session exists (landing → selfie *or* avatar →
onboarding → quiz), and onboarding is where `POST /sessions` happens. So the picker will:

1. Ask for race + gender in the picker itself, then `GET /avatars?race=…&gender=…`.
2. Render the 9 results as a 3×3 grid; hold the chosen `avatar_id` **in memory only**.
3. On the onboarding submit, after `POST /sessions` returns the id, immediately
   `PATCH /sessions/{id}/photo/avatar { avatar_id }` — same slot in the flow where the
   selfie path currently does presign → PUT → confirm.
4. The reveal page then polls `GET /sessions/{id}/images` exactly as it does today — it
   doesn't know or care which path the user took.

---

## 1. Are the avatars' outcome images pre-generated and stored, or re-rendered per session?

> **ANSWERED — pre-generated and stored, exactly as we asked.** §3.8: "Nothing is
> generated on this path — every avatar has an admin-approved with/without-insurance image
> pair pre-generated and stored against it, and selecting the avatar copies that pair onto
> the session." So: no wait, no AI variance, no `FAILED` to design for.

**This is the one that matters most to us.**

§3.8 says selecting an avatar *"kicks off the same background with/without-insurance
image generation"*. That reads like the avatar gets pushed through the AI pipeline again,
per session.

We'd much rather it didn't. The 9 avatars per race/gender are a **fixed, curated set**, so
their two outcome images ("with insurance" / "without insurance") can be generated once by
an admin and stored against the avatar row in the database. Serving those stored images
means, for every avatar user:

- no wait — the pair is available the instant the avatar is selected;
- no AI variance — everyone picking the same avatar sees the same approved images
  (important, since these are the emotional payoff of the whole funnel and we can't
  review every generated output);
- no `FAILED` state to design a fallback for.

**Question:** does `PATCH /photo/avatar` serve stored, pre-approved images for that avatar,
or run a fresh generation? If it's a fresh generation today, can it be changed to serve
stored ones?

## 2. If they're pre-stored, does `/images` return `READY` immediately?

> **ANSWERED — yes, `READY` on the first call**, with both urls and the four copy
> fields. "No `GENERATING` phase, no `FAILED` state to design for. (Polling anyway is
> harmless; it just returns `READY`.)" Our shared polling code is unchanged — an avatar user
> simply never sees the "developing…" state.

i.e. for an avatar session, can `GET /sessions/{id}/images` skip `GENERATING` altogether and
come back `READY` with both URLs on the first call? We'll still poll (the code is shared with
the selfie path), we just want to know whether the "developing…" state will ever be seen by
an avatar user.

## 3. Are the four copy fields populated for avatar sessions too?

> **ANSWERED — yes**, the first `/images` call returns both urls *and* the four copy
> fields. (We still render our own Webflow copy database for those slots — that decision is
> unchanged and documented in api-contract §5.)

`heading_with`, `heading_without`, `subtext_with`, `subtext_without` — same behaviour on the
avatar path as on the selfie path? (We have static Webflow copy as a fallback either way, so
`null` is survivable; just want to know which to expect.)

## 4. Does `GET /sessions/{id}/photo` work for an avatar session?

> **ANSWERED — yes.** §5: it returns a fresh presigned url for "the original selfie, **or
> the chosen avatar image** on the avatar path", `404` only if the session has neither. So
> the nice-to-have `GET /avatars/{id}` below is moot.

§5 describes it as a fresh presigned URL for "the original selfie", `404` if none. For a
session whose photo came from `PATCH /photo/avatar`, does it return a fresh URL for the
chosen avatar image, or `404`?

We need this because avatar URLs from `GET /avatars` expire in ~10 minutes — if we ever want
to re-display the user's chosen avatar later in the funnel (e.g. a small thumbnail on a
later screen), re-fetching the whole 9-item catalog just to recover one URL is wasteful.

## 5. What's the catalog coverage on staging right now?

> **ANSWERED (2026-08-21, verbally).** Measured against staging that day: **19 of 90 slots
> selectable** — black/male 9/9, black/female 9/9, coloured/female 1/9, and 0/9 for the
> other seven combinations. Every one of the 90 avatars reports `status: READY`, so the
> portraits are all done; what was missing is the **with/without-cover pair** each avatar
> needs before §3.7 publishes its `url` (and before `PATCH …/photo/avatar` stops
> returning `409`). Kenton has given the dev the go-ahead to **generate all of them**.
> No frontend work: the picker re-fetches on every entry and filter change, so cards
> become selectable as their pairs land. Re-measure with the loop in the note below.

How many of the 10 race × gender combinations currently have all 9 avatars at
`status: "READY"`?

We'll handle non-`READY` slots properly (rendered as a disabled placeholder, not selectable,
per §3.7) — but if most combinations are empty on staging we can't demo or QA the picker, so
we'd want to know what to expect and when it fills up.

## 6. Is the `AvatarRace` enum final?

`black`, `white`, `indian`, `asian`, `coloured`.

We hardcode these exact strings as attributes in the Webflow Designer, so a rename is a
change in two places (code + Designer). Just confirming they're stable before we commit to
them.

## 7. Any rate limiting or caching guidance on `GET /avatars`?

We call it fresh on every race/gender toggle and on every entry to the picker page (rather
than caching, since the presigned URLs expire in ~10 minutes). If a user flicks through the
race options that could be ~10 calls in a few seconds. Is that fine, or should we debounce?

## 8. Does `PATCH /photo/avatar` set the session's `gender`?

Our picker asks for gender in order to query the catalog, and onboarding also collects
gender for `POST /sessions`. We plan to pre-fill onboarding from the picker's choice so they
always agree — but we want to know whether the avatar PATCH writes `gender` onto the session
independently, in case the two could ever diverge server-side.

## 9. Confirming: `PATCH /contact/phone` on an `IN_PROGRESS` session is fine?

> **ANSWERED — yes.** §3.10: the contact endpoints accept `IN_PROGRESS` *and*
> `COMPLETED`; only `ABANDONED` returns `409`. Our onboarding call right after session
> create is supported.

§3.9 frames contact capture as a results-screen thing, and says only `ABANDONED` returns
`409`. We already collect a WhatsApp number on our onboarding screen (before the quiz), so
we'd like to `PATCH /contact/phone` right after session create — while the session is
`IN_PROGRESS`. Confirming that's supported and won't be locked down later.

---

### Nice-to-have, not blocking

- ~~**A single-avatar endpoint** (`GET /avatars/{id}` returning a fresh presigned URL)~~ —
  no longer needed: `GET /sessions/{id}/photo` covers the avatar case (Q4).

### Re-measuring coverage

```sh
B=https://api-staging-discovery.injozitech.com/api/v1
for combo in black:male black:female white:male white:female indian:male \
             indian:female asian:male asian:female coloured:male coloured:female; do
  r=${combo%%:*}; g=${combo##*:}
  curl -s "$B/avatars?race=$r&gender=$g" | python3 -c "
import sys,json; a=json.load(sys.stdin).get('avatars',[])
print('$r/$g', sum(1 for x in a if x.get('url')), '/', len(a))"
done
```

`url` present = selectable. `status` is not the signal (§3.7).

### One inconsistency worth a reply

The `slug` format differs between the two avatar endpoints in the handover: §3.7 shows
`black-male-young-adult-1` (hyphenated age group) and §3.9 shows
`indian-female-young_adult-1` (underscored). Harmless for us — we key off `id` everywhere —
but it would bite anyone matching slugs across the two endpoints.
