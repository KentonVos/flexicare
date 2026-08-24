# CHANGELOG

Newest first. One entry per change you push. Keep it plain:
what changed, which file, and why. This is how a fresh session (and future you)
knows the current state without re-reading every file.

Format:
```
## YYYY-MM-DD — short title
- file(s) touched
- what changed and why
- any Webflow-side change needed (new attribute, head snippet, etc.)
```

---

## Where things stand — 2026-08-24 (end of the reveal-page debugging pass)

A snapshot for the next session, so nothing below has to be re-derived. Details are in
the dated entries under it.

**Journey as it stands:** landing → selfie **or** avatar picker → onboarding → `/archetype`
(ROUTING quiz) → `/meet-your-two-selves` (reveal) → FLEX stage. The journey is **not
finished**; this pass was debugging/polishing what exists rather than adding pages.

**This pass fixed four reveal-page bugs that all presented as "it only works after a
refresh". They had ONE root cause between them:** during a Barba swap BOTH containers are
in the DOM and the pages are structurally identical, so any document-wide lookup is a coin
toss between the incoming and the outgoing page.
- The per-archetype copy was written into the **outgoing** container
  (`document.getElementById`), so the visible cards kept the Designer's placeholder while
  the copy cycler updated orphaned nodes for the rest of the visit. `copyTargets()` now
  resolves inside `state.wrap` → its container → the document, keeps only **attached**
  nodes, and writes every match. The cycler prunes detached nodes each tick.
- Every controller's `resolveWrap()` had a document-wide fallback, so the **quiz**
  controller initialised on the reveal page (its `afterEnter` hook runs everywhere),
  concluded the stage was already complete on a resumed session, and fired a **second**
  `barba.go()`. The destination then ran its entrance animation, `init()`, skeleton pass
  and copy paint **twice**. The fallback is now hard-load-only, and `go()` refuses to
  navigate to the path it is already on. Fixed in quiz, reveal and avatar (identical
  resolvers). This was also why two reveal containers coexisted in the first bug.
- The first name never came back on a `barba.go()` arrival (so `[data-reveal-name-wrap]`
  stayed hidden): recovery was a side effect of `ensureArchetype()`'s session fetch, which
  is skipped when the quiz has already set the archetype. `init()` now recovers it
  independently, sharing one cached `fetchSession()`.
- The placeholder copy flashed before the shimmer: `markSkeleton()` now runs at
  script-execution time, and slots can ship hidden behind a Webflow combo class
  (`data-reveal-hide-class`, default `is-0`) — CSS in the head is the only thing that
  applies at first paint.

**Diagnostics added — use them before theorising.** `?fcdebug` (sticks in localStorage;
`?fcdebug=off` clears it) now also shows an **ENTERS** row (one line per page entry, red
when the same path is entered twice) and the **reveal copy tracer** (PAINT lines: where the
database was read from, which element each slot was written into, whether it is attached,
what makes it hidden; then one AUDIT line per slot 1.5s later saying whether that is still
the element on screen). The duplicate-entry `console.warn` is NOT gated — it prints for
anyone with a console open. Both are described in ARCHITECTURE.md § transition.js.

**Waiting on the backend (no frontend work pending):**
- The dev is generating the missing **with/without-cover image pairs**. Only 19 of 90
  avatar slots were selectable on 2026-08-21 (black/male 9/9, black/female 9/9,
  coloured/female 1/9); a slot becomes selectable the moment its pair is approved, with
  no republish needed. Re-measure with the loop in `AVATAR-BACKEND-QUESTIONS.md`.
- Still unanswered there: Q6 (is `AvatarRace` final?), Q7 (rate limits on `/avatars`),
  Q8 (does the avatar `PATCH` write the session's `gender`?). None blocking.
- Asked for, not blocking: a `selectable`/`baked` flag (or the transparent url) on the
  `/avatars` response — that would let the picker drop its second request.

**Known pre-go-live tasks:**
- The API base in `flexicare-core.js` is still **staging**
  (`api-staging-discovery.injozitech.com`).
- Remove `data-reveal-debug` from `[data-reveal]` — presence alone turns on console logging.

**Open Webflow-side items on the reveal page** (the code is done; these are Designer edits):
1. `data-reveal-copy-state` is currently `Loading...` — it must be exactly `loading`, or the
   pre-JS CSS matches nothing.
2. `data-reveal-timeout` is `9000` (9 seconds). The default is `90000`; 9s makes the selfie
   path fall back to the placeholder image pair before generation finishes.
3. Add the `is-0` combo class (`opacity: 0`) to the four copy slots, and
   `data-reveal-skeleton-target` on their WRAPPERS — `opacity: 0` also hides the element's
   own shimmer bar, so the shimmer has to live on the wrapper. `is-0` and `data-anim` must
   not share an element: GSAP writes inline opacity during the entrance and inline beats a
   class.

**Attribute added to the contract this pass:** `data-reveal-hide-class` on `[data-reveal]`
(default `is-0`, empty disables). Everything else was already documented.

**Next up:** the FLEX stage / next phase of the journey (fresh session).

---

## 2026-08-24 — FIXED: the reveal page was entered TWICE (double entrance animation)
- `src/flexicare-quiz.js`, `src/flexicare-reveal.js`, `src/flexicare-avatar.js`, `CLAUDE.md`
- The "data-anim runs twice, then everything re-animates when the shimmer resolves"
  symptom, caught by the new ENTERS warning. Stack: `quiz init → completeStage → go`.
- Cause: every controller's `resolveWrap()` ended with a document-wide fallback. During a
  Barba swap the OUTGOING container is still in the DOM, so arriving at the reveal page the
  QUIZ controller's `afterEnter` hook matched the wrapper of the page we had just LEFT,
  initialised there, found every routing answer already present (resumed session), called
  `completeStage()` and fired a SECOND `barba.go('/meet-your-two-selves')`. Everything on
  the destination ran twice: entrance animation, controller init, skeleton pass, copy paint.
  This is also why two reveal containers coexisted in the earlier copy bug.
- Fix, in all three controllers that had the resolver: the document fallback is now used
  ONLY when the scope IS the document (the hard-load path). An incoming container without
  the page's wrapper means "not this page" → bail. If the wrapper is genuinely parked
  outside `data-barba="container"` it warns, naming the authoring bug, instead of guessing.
- Also added `samePath()` to those three `go()` helpers: never navigate to the page you are
  already on, so a stale controller can't enter a page twice even if one slips through.
- Webflow: nothing.

## 2026-08-24 — Debug panel: ENTERS row (is the page entered twice?)
- `src/transition.js`
- "`data-anim` runs twice", "the copy loads, THEN the shimmer starts", and the original
  "two containers in the DOM at afterEnter" are all one symptom if the page is being
  ENTERED TWICE — every entrance animation, controller init and skeleton pass runs again.
- `?fcdebug` now shows an ENTERS row: one line per page entry (`once`/`enter`, path,
  timestamp), red and flagged `← ENTERED TWICE` when the same path is entered twice in a
  row. Hooks are registered always (a capped 8-entry array); only the panel is gated.
- Webflow: nothing. Dev-only.

## 2026-08-24 — Reveal: the name (and its wrapper) on arrival, not only after a refresh
- `src/flexicare-reveal.js`, `ARCHITECTURE.md`
- `[data-reveal-name-wrap]` stayed hidden on a `barba.go()` arrival: it is hidden when
  there is no name, and `FC.firstName` is memory-only, so a hard reload earlier in the
  funnel loses it while the session id survives. The recovery was a side effect of
  `ensureArchetype()`'s `GET /sessions/{id}`, and that whole function short-circuits when
  the quiz has already set the archetype — so the fetch never happened. A refresh is the
  one path that always takes the recovery route, hence "only works on refresh".
- Split the session read out into `applySession()` + a cached `fetchSession()`, and `init()`
  now recovers the name on its own account when `FC.firstName` is empty, repainting when it
  lands (and calling `recoverEcho()`, which has the same memory-only dependency). Both
  paths share the one in-flight request, so no extra API call. Failure is never fatal —
  no name just means the greeting stays hidden.
- Webflow: nothing.

## 2026-08-24 — Reveal: data-reveal-hide-class (the `is-0` combo class)
- `src/flexicare-reveal.js`, `ARCHITECTURE.md`, `docs/reveal-loading-state.md`
- Closes the pre-JS gap properly, from the Webflow side instead of a head snippet: the
  page ships its copy slots with a combo class at `opacity: 0`, Webflow's stylesheet is in
  the `<head>` so it applies at FIRST PAINT, and `clearCopySkeleton()` strips the class
  from the whole `[data-reveal]` subtree once the real copy is in. Also on the error path,
  so an unresolvable archetype falls back to the Designer's copy rather than an invisible
  card. Invalid class name warns and bails instead of stranding the page.
- Name it with `data-reveal-hide-class` on `[data-reveal]` (default `is-0`, empty = off).
- **Webflow:** add the `is-0` combo class (`opacity: 0`) to `#with-cover-heading`,
  `#without-cover-heading`, `#with-cover-text`, `#without-cover-text`. Because `opacity: 0`
  also hides that element's shimmer bar, put `data-reveal-skeleton-target` on the slot's
  WRAPPER if you want a shimmer while the text is invisible. The head `<style>` from the
  previous entry is no longer needed.

## 2026-08-24 — Reveal: shimmer before the placeholder can paint
- `src/flexicare-reveal.js`, `docs/reveal-loading-state.md`
- On a hard load the sequence read "placeholder copy → shimmer starts → real copy": the
  browser paints before `DOMContentLoaded`, and that is when `boot()` first called
  `markSkeleton()`. The placeholder flashed past looking like the answer.
- `markSkeleton(document)` now runs at script-execution time. Webflow loads these in the
  footer, so the reveal markup above them is parsed and the targets are found; if the
  script is ever moved to the head it is a no-op and `init()` marks again. Idempotent
  either way.
- Webflow: nothing required. For the last few pre-JS frames, `docs/reveal-loading-state.md`
  step 1 now has an optional head `<style>` — the only thing that applies at first paint.

## 2026-08-24 — Reveal copy: FIXED — it was going into the outgoing container
- `src/flexicare-reveal.js`, `ARCHITECTURE.md`
- Root cause, from the `?fcdebug` audit: `our element still in the DOM: false` on all four
  slots, with a different node carrying the same id on screen. `copyTargets()` used
  `document.getElementById()`, which searches the whole document in DOCUMENT ORDER — and
  during a Barba swap the document holds BOTH containers, so it handed back the OUTGOING
  one. The correct copy (archetype B) was written into a container about to be removed, the
  cycler then updated orphaned nodes for the rest of the visit, and the visible cards kept
  the Designer's placeholder. A refresh has one container, hence "only works on refresh".
- Fix: `copyTargets()` searches `state.wrap` → its `[data-barba="container"]` → the
  document, keeps only nodes that are actually attached, and writes EVERY match (so a
  second copy of a card for another breakpoint gets the copy too). `startCycle()` prunes
  detached nodes each tick, like `orb-motion.js` does for removed elements.
- Webflow: nothing.

## 2026-08-24 — Reveal copy: dev-only tracer for the "placeholder comes back" case
- `src/flexicare-reveal.js`
- The HTML fallback below made the copy appear on arrival, but it then reverted to the
  Designer's placeholder once the shimmer cleared. Nothing in this repo restores cached
  text, so this is either the copy landing in a DIFFERENT element than the visible one
  (duplicate ID / hidden `[data-reveal-for]` twin / a second breakpoint copy of the card)
  or something rewriting the element after the paint.
- Added `traceCopy()`, gated behind `?fcdebug` (the sticky localStorage flag transition.js
  already owns, since the bug spans a `barba.go()`): per slot it logs how many `#id` and
  `[data-reveal-slot]` matches exist, which element was written, whether it carries
  `data-text-reveal`, what (if anything) makes it `display:none`, and the resulting text —
  then MutationObserves each target and `console.trace()`s any later rewrite.
- Webflow: nothing. Dev-only; silent without `?fcdebug`.

## 2026-08-24 — Reveal copy: populate on arrival, not only after a refresh
- `src/flexicare-reveal.js`, `ARCHITECTURE.md`
- Bug: on `/meet-your-two-selves`, the with/without headings and text kept Webflow's
  placeholder copy on a `barba.go()` arrival and only came right on a hard refresh.
  Cause: `[data-reveal-copy]` was not in the live DOM on arrival
  (`document.querySelectorAll('[data-reveal-copy]').length === 0`), so `collectCopy()`
  had nothing to read — the embed is outside `data-barba="container"`, which is the only
  thing Barba swaps.
- Fix: new `copySources()` reads the database from the live DOM and, when that is empty,
  from the INCOMING PAGE'S HTML — `data.next.html`, stashed in the `beforeEnter` hook and
  parsed once per arrival with `DOMParser` (same approach as `syncShellClasses()`).
  `collectCopy()` and `allSlotNames()` both go through it, so the skeleton derives the
  right slots too. Targets stay live-DOM (`copyTargets()`) — those are inside the
  container. The old "no database in the DOM" warning now only fires when there is no
  source at all; recovering from HTML warns separately and names the structure bug.
- Webflow: nothing required — the page renders correctly as-is. Still worth moving the
  `copy-database-embed` INSIDE `data-barba="container"` (`glass-content-wrapper`) to
  clear the warning and keep the page-specific data with the page.


## 2026-08-24 — Docs: the canonical shell structure, and the reveal page's shell fixed

- `ARCHITECTURE.md` (§ transition.js), `CLAUDE.md`
- Wrote down the exact tree every page must ship outside `data-barba="container"`,
  because it had to be re-derived from scratch to find this bug and the panel's
  CHAIN block now makes it checkable in seconds.
- The cause, measured: the reveal page had ONE EXTRA level —
  `content-flex-wrapper` between `container-large` and `scroll-wrapper`, with
  `top-section-wrapper` inside it rather than beside the container. Every other
  page is `container-large > <scroll wrapper> > { top-section-wrapper, container }`.
- One level is enough to break everything after the first page: `syncAncestors()`
  walks both chains in lockstep checking only tagName, so off by one it pastes
  every class one level from where it belongs. The container came out 684px on
  arrival vs 789px on refresh, and it threw a bogus
  `live is <main>, next has <div>` warning from comparing `<main>` against
  `content-wrapper` — symptoms that look unrelated and aren't.
- **Fixed in Webflow** (no code change): on `/meet-your-two-selves`,
  `top-section-wrapper` moved inside `scroll-wrapper` above the container,
  `scroll-wrapper` moved up to be a direct child of `container-large`,
  `content-flex-wrapper` deleted with its layout styles moved onto
  `scroll-wrapper`. Also `copy-database-embed` moved INSIDE the container — at
  body level Barba never brought it across, so the cards silently kept the
  Designer's placeholder copy on every arrival. Confirmed working.

## 2026-08-24 — Debug panel: ancestor-chain compare + a "stranded outside the container" check

- `src/transition.js`, `src/flexicare-reveal.js`
- The reveal page's Navigator showed the Barba container is `glass-content-wrapper`
  INSIDE `scroll-wrapper` — so `scroll-wrapper` is its parent, not a sibling, and
  the abandoned-branch message could only mean the two pages' shells are a
  different SHAPE (a wrapper level one page has and the other doesn't). Classes
  can't reveal that: `syncAncestors()` walks both chains in lockstep checking only
  tagName, so an off-by-one chain lands every class one level from where it
  belongs, quietly changing flex gap / justify-content / padding all the way up.
- New CHAIN block in the panel: the container's ancestor chain, live vs the
  incoming page, captured BEFORE any class is copied, with mismatched levels in
  red. This is the readout that names the structural difference.
- New STRANDED line: flags page-specific content parked outside
  `data-barba="container"`. `[data-reveal-copy]` at body level exists on a hard
  load and is simply ABSENT on a barba.go() arrival, so the reveal page keeps the
  Designer's placeholder copy — which reads as real copy, so it goes unnoticed,
  and a refresh hides it entirely.
- `paintDatabaseCopy()` now `console.warn`s (was `dbg()`) when it finds no
  database, and says what to check. Silent-by-default was the wrong call here.
- Webflow: move the `copy-database-embed` INSIDE the reveal page's Barba container.

## 2026-08-24 — Debug panel: list every abandoned branch + the container's siblings

- `src/transition.js`
- The panel found the reveal-page bug on its first outing but only printed the
  LAST abandoned shell branch of two. It now lists them all, numbered.
- New SIBLINGS line: every persistent sibling of the Barba container with its
  height and child count. That's the smoking gun for "the container is shorter
  on arrival than on refresh" — a sibling only the FIRST page shipped stays in
  the DOM for the whole journey (it's outside `data-barba="container"`, so
  nothing removes it) and steals its height from every later page. Non-zero
  heights are flagged red.
- Panel now scrolls (max-height 70vh) since it can get long.

## 2026-08-24 — transition.js: a visual layout debug panel (?fcdebug)

- `src/transition.js`
- Chasing the reveal page's "content pushed off screen on arrival, fine on refresh".
  Several causes look identical on screen and reading them off the console
  mid-transition is impractical, so this puts the discriminating numbers on the
  page, live: what `pageIdentity()` resolved AND FROM WHERE (URL vs a
  `data-page-id` override), the nav's should-hide vs actually-hidden plus its live
  height, document overflow beyond the viewport WITH A PEAK (so a transient spike
  mid-transition is still readable afterwards), the container height, and any
  shell-sync branch that was abandoned. The nav wrapper gets outlined too.
- `?fcdebug` STICKS in localStorage — the bug spans a navigation and `barba.go()`
  drops the query string. `?fcdebug=off` clears it. Nothing renders otherwise.
- Webflow: no change. The file list is unchanged (it lives in transition.js, not
  a new file), so the footer stays as it is.

## 2026-08-24 — transition.js: name the shell-sync failure instead of failing quietly

- `src/transition.js`
- Chasing "the reveal page's layout is wrong on arrival but right after a
  refresh" — the exact symptom `syncShellClasses()` exists to prevent. When it
  can't match a branch (tagName mismatch, or child counts disagree) it
  deliberately gives up rather than write classes onto the wrong elements, but
  it did so SILENTLY, so the resulting stale-class layout bug looked like magic.
- It now `console.warn`s once per session per spot, with the element path and
  what didn't line up, and says what to fix in Webflow (shell structure must
  match across pages; only classes may differ).
- New: `PageTransition.shellSnapshot()`. Run it on the broken page, hard-refresh,
  run it again — it diffs the two and prints exactly which shell classes the
  sync failed to bring across. If it reports "IDENTICAL", stale shell classes
  are ruled out and the cause is the container's own entrance instead.
- Webflow: no change.

## 2026-08-24 — Reveal page: actually hide the placeholder image under the shimmer

- `src/flexicare-reveal.js`, `docs/reveal-loading-state.md`
- The image skeleton shimmered but you could still see Webflow's placeholder
  asset through it — the sheen is semi-transparent, so over a grey placeholder
  photo it still reads as a photo. The rule meant to hide it was keyed to the
  WRAPPER's `data-reveal-state`, which `markSkeleton()` (running on beforeEnter)
  hadn't stamped yet, and was `:where()`-wrapped, so anything could outrank it.
- Now each pending image is marked `data-reveal-image-pending` and given an
  INLINE `opacity: 0` — nothing can outrank that. It keeps its box (no reflow),
  is revealed the moment the real file decodes, and if the pair never arrives the
  placeholder comes back, so a page with no `[data-reveal-images-fallback]` is
  never left blank. `markSkeleton()` also stamps `data-reveal-state="loading"`
  itself now, rather than waiting for init.
- Webflow: no change needed.

## 2026-08-24 — Reveal page: loading skeleton for the copy and the images

- `src/flexicare-reveal.js`
- The reveal page painted the Designer's PLACEHOLDER copy until the archetype
  resolved — instant coming from the quiz, but seconds of fake-looking text on a
  hard reload or deep link (GET /sessions/{id} → maybe GET /quiz → POST
  /routing/preview). Now every slot the copy database writes into, plus
  [data-reveal-name] / -archetype-label / -echo, shimmers until the real copy is
  in; the image cards shimmer until the pair is READY or the fallback shows.
- Marked on `beforeEnter` (before the page is visible), cleared AFTER the paints,
  so the text is revealed already correct instead of flashing the placeholder.
  Cleared on the error branch and on teardown too — it can never get stuck on.
- Same pattern as the quiz skeleton: CSS injected into the persistent head
  (Barba never swaps it), flagged `data-js-injected`, `:where()`-wrapped so page
  CSS wins without `!important`. Vars on `[data-reveal]`:
  `--fc-reveal-skeleton-bg / -sheen / -speed / -radius`.
- Webflow: nothing is REQUIRED — it auto-marks from the existing attributes.
  Optional: `data-reveal-image-frame` on an image's wrapper, `data-reveal-no-skeleton`
  to exclude an element, `data-reveal-skeleton-target` to add one,
  `data-reveal-skeleton="off"` on `[data-reveal]` to turn it all off.

## 2026-08-24 — Quiz: per-question label on the Next button

- `src/flexicare-quiz.js`
- The nav's Next button can now read something else on the FINAL question, so the
  routing quiz ends on "See your 2 selves" instead of "Next". The label is swapped
  in `applyState()`, so it's correct on first paint, on every advance, and on Back.
- Webflow: put `data-quiz-next-label` on the TEXT element inside the next button,
  and on `[data-quiz]` add `data-quiz-next-text-last="See your 2 selves"`
  (optionally `data-quiz-next-text="Next"` — it defaults to whatever text the
  button already contains). Without `data-quiz-next-label` nothing changes.

## 2026-08-21 — Docs: state of play + avatar coverage measurement
- README.md, AVATAR-BACKEND-QUESTIONS.md, CHANGELOG.md
- Recorded the measured staging coverage (19/90 selectable, every avatar `status: READY`
  — the gap is the scenario pairs), the go-ahead to generate all of them, and a
  copy-paste loop for re-measuring. Added the "Where things stand" snapshot above.

## 2026-08-21 — Avatar picker: show the transparent-background faces
- src/flexicare-avatar.js, docs/api-contract.md, ARCHITECTURE.md, CLAUDE.md
- The picker now DISPLAYS the transparent-background webp renders from
  GET /avatars/web (§3.9) while still GATING SELECTION on GET /avatars (§3.7).
  Verified on staging: both endpoints return the same 9 ids in the same order for a
  race/gender, so they join cleanly on `id` (mergeWeb()).
- Why it matters beyond the cut-out look: §3.7 withholds a url until that avatar's two
  scenario images are approved, and on staging only black/male + black/female (+1 slot)
  are baked — every other combo was an empty 3x3 grid. /avatars/web has all 90, so those
  slots now show their FACE, dimmed and unclickable, instead of nothing. Selection stays
  gated because PATCH …/photo/avatar 409s for an unbaked avatar.
- The /web call is best-effort (failure → catalog jpgs, picker unchanged). Opt out with
  data-avatar-transparent="off" on [data-avatar]. report() gained selectable/showing
  columns so you can see which image each slot is using.
- WEBFLOW: style [data-avatar-unavailable] / .is-unavailable as a DIMMED FACE, not an
  empty placeholder — it now usually has an image. If your cards had a solid background
  behind the jpg, that background is now what shows through the cut-out. No script list
  change.

## 2026-08-21 — Backend handover update: the avatar path generates nothing
- src/flexicare-avatar.js, src/flexicare-onboarding.js, src/flexicare-reveal.js,
  docs/api-contract.md, AVATAR-BACKEND-QUESTIONS.md, ARCHITECTURE.md, CLAUDE.md
- The dev's updated handover answers our open avatar questions (Q1–Q4, Q9), and one
  answer changes behaviour: **a catalog avatar is selectable iff its `url` is present**,
  not when `status` says READY — the url is only issued once the avatar AND its two
  approved scenario images are ready, so it's the stricter signal. flexicare-avatar.js
  now gates on `url` (three places) and keeps `status` for the debug table only. This
  makes MORE avatars selectable, not fewer, if a slot ever reports a lagging status.
- The rest is documentation of settled facts: PATCH …/photo/avatar generates nothing (the
  approved with/without-cover pair is pre-stored and copied onto the session), so
  /images is READY on the reveal page's FIRST poll — "developing…" and FAILED are
  selfie-path states. GET /sessions/{id}/photo now also covers the avatar path.
- New endpoint documented but NOT used: GET /avatars/web (§3.9) — the same 90 slots as
  transparent-background webp for the marketing site, read-only, no session. Its urls
  are presigned (~10 min) so a page using them must call the API on load; that needs a
  small script of its own if we ever want it.
- No Webflow change. No script list change.

## 2026-08-21 — Quiz page: loading skeleton for the options, prompt and nav
- src/flexicare-quiz.js, docs/quiz-loading-state.md (new), docs/avatar-loading-state.md,
  ARCHITECTURE.md, README.md
- Same problem the avatar grid had: /archetype can't paint until GET /quiz lands, so
  the authored [data-quiz-option-template] card was visible for a beat. A prime() on
  Barba beforeEnter now hides the template before the page is visible, stamps
  data-quiz-state="loading" and appends N inert shimmer clones
  ([data-quiz-skeleton-option] — no data-quiz-option, aria-hidden, labels blanked, so
  they can't be clicked or read). Prompt/helper shimmer as bars, Next/Back dim.
  buildOptions() + teardown() clear the skeleton; showLoading() covers the hard-load path.
- The stylesheet ships with the script (injectCSS(), :where()-wrapped, tunable via
  --fc-quiz-skeleton-bg/-sheen/-speed on [data-quiz]) for the same Barba-head reason
  as the avatar one. Opt out with data-quiz-skeleton="off".
- WEBFLOW: on [data-quiz] add data-quiz-skeleton-count="4" (however many options a
  question in this stage usually has) and a static data-quiz-state="loading".
  Nothing to paste; script list unchanged, so the footer is untouched.

## 2026-08-21 — Avatar skeleton: ship the CSS with the script (it only worked after a reload)
- src/flexicare-avatar.js, docs/avatar-loading-state.md, ARCHITECTURE.md
- The shimmer was dead on the first arrival and alive after a reload, because the
  CSS was pasted into the PAGE's Custom Code: Barba only swaps the container, never
  the <head>, so page-level head code exists on a hard load and is missing on every
  barba.go(). The script now injects the stylesheet itself (`injectCSS()`, once,
  marked data-js-injected so the shell sync skips it) — same precedent as
  transition.js's FOUC rule.
- Selectors are :where()-wrapped (zero specificity) and the look is driven by
  --fc-skeleton-bg / -sheen / -speed / -fade on [data-avatar], so Webflow overrides
  win without !important. `data-avatar-skeleton="off"` on the wrapper opts out.
- WEBFLOW: you can now DELETE the <style> block from the avatar page's Custom Code —
  it does nothing on a Barba arrival anyway. Keep the static
  data-avatar-state="loading" attribute on the wrapper. Any custom shimmer styling
  belongs in the SITE head (Site Settings → Custom Code), not the page's.

## 2026-08-21 — Avatar picker: loading skeleton for the cards and controls
- src/flexicare-avatar.js, docs/avatar-loading-state.md (new), ARCHITECTURE.md, README.md
- Navigating to the avatar page briefly showed the Designer's placeholder cards
  before the catalog landed. The controller now stamps a loading state early and
  per-card so the gap can be shimmered from CSS: `prime()` on Barba `beforeEnter`
  puts `data-avatar-state="loading"` on the incoming container before it paints
  (init runs on afterEnter, too late), each card carries
  `data-avatar-card-state="loading|ready|unavailable"` + `is-loading` + `aria-busy`
  until its OWN image decodes, and the filter pills / Next / Back get `is-loading`
  while the fetch is in flight. Nothing paints in JS — the look is all Webflow CSS.
- WEBFLOW: (1) add a static `data-avatar-state="loading"` attribute to the
  `[data-avatar]` wrapper — on a hard load the footer scripts run after first paint,
  so the attribute has to be there from the Designer; the script clears it.
  (2) paste the CSS from `docs/avatar-loading-state.md` into the page's head.
  Optional per-element override: `data-loading-class="YourCombo"`.
  No script list change — the footer is untouched.

## 2026-08-21 — Avatar picker: slot cards are found across every grid wrapper
- src/flexicare-avatar.js
- A 3x3 built as three flex rows is three [data-avatar-grid] elements, and slot cards were
  being collected from only the FIRST one — so slots 4-9 were never filled. They now come
  from the whole [data-avatar] wrapper, which makes their nesting irrelevant and the
  attribute itself optional in static mode (clone mode still needs one grid, as the append
  target). Selection and clone cleanup are wrapper-scoped for the same reason.
- Telling a broken page from a catalog gap: data-avatar-debug now prints a per-slot table
  (slot / slug / status / image) after every load, and Flexicare.avatarPicker.report()
  prints it on demand. Fewer slot cards than avatars returned warns unconditionally.
- The Designer's own image in each card survives as that slot's placeholder — an
  unpopulated slot is never overwritten, only marked is-unavailable. So a distinct
  placeholder per slot shows which faces the backend is still missing.
- WEBFLOW SIDE: nothing new. (Footer already updated in the entry below.)

## 2026-08-20 — Avatar picker: the no-selfie path (+ contact/phone wiring)
- NEW src/flexicare-avatar.js; src/flexicare-core.js, src/flexicare-onboarding.js;
  docs/api-contract.md, docs/hosting-and-publishing.md, CLAUDE.md, ARCHITECTURE.md;
  NEW AVATAR-BACKEND-QUESTIONS.md
- New page controller for the avatar picker — the route for users who don't want to be
  photographed. Gender + race pills drive GET /avatars?race=&gender= (always 9: 3 age
  groups x 3 variants). Non-READY slots are unselectable placeholders (the catalog is
  admin-curated). Filter changes are debounced 180ms and the catalog is re-fetched on every
  entry, because those urls are presigned (~10 min) — only the chosen id is kept.
- The grid supports TWO builds. STATIC (the path we're using): nine authored
  [data-avatar-slot="1".."9"] cards, numbered in reading order — the API's 9 always come
  back young_adult 1-3, middle_aged 1-3, elder 1-3 — filled in place and never removed, so
  the Designer's per-card styling/flex wrapper/glass all survive. Because the filters say
  which SET is loaded, the card attribute needs no race/gender: one name covers all 10
  sets. CLONE (fallback): one [data-avatar-option-template], used only when no slot cards
  exist.
- The filter pills may be a Tabs component's tab-links, but NOTHING may depend on Webflow's
  Tabs JS — it binds once on DOMContentLoaded, so after a Barba swap the panes stop
  switching and w--current stops moving. Style the selected state on is-selected (which
  this script toggles) and keep gender/race as sibling rows, not nested Tabs.
- The race pill VALUE is the API enum, not the label: the design's "Mixed" pill is
  data-avatar-race="coloured". Wrapper config uses -url/-default suffixes
  (data-avatar-next-url, -back-url, -gender-default, -race-default) so the wrapper is never
  matched by the pill/button queries.
- core: FC.avatar + setAvatar/getAvatar/hasAvatar/clearAvatar and FC.avatarGender, both
  cleared by resetJourney. Selfie and avatar are MUTUALLY EXCLUSIVE — setAvatar() clears
  FC.photo and setPhoto() clears FC.avatar, so whichever the user did last is what ships.
- onboarding: sends whichever is buffered — selfie upload as before, or the new
  PATCH /sessions/{id}/photo/avatar { avatar_id } (the picker can't send it itself; that
  endpoint needs the session id, which is created here). Also now sends the WhatsApp number
  via PATCH /sessions/{id}/contact/phone — that endpoint accepts IN_PROGRESS sessions, so it
  no longer waits for a results screen. Both run in parallel and neither blocks navigation.
  The gender pills pre-fill from FC.avatarGender when the user came via the picker.
- Reveal page UNTOUCHED, deliberately: both paths converge on GET /sessions/{id}/images, so
  there is nothing to branch on. Whether the avatar's outcome pair is pre-generated/stored
  or re-rendered per session is a backend question — see AVATAR-BACKEND-QUESTIONS.md (also
  noted in api-contract.md §3.8). The four new copy fields on a READY /images response
  (heading_with/without, subtext_with/without) are intentionally IGNORED: the reveal page's
  Webflow copy database stays the source of truth for those slots.
- WEBFLOW SIDE — needed:
  1. FOOTER CHANGED (a script was added). New list, in order — note flexicare-reveal.js was
     also missing from the copy in docs/hosting-and-publishing.md; check the live footer has
     it:
       glass.js, transition.js, text-reveal.js, background-motion.js, orb-motion.js,
       flexicare-core.js, flexicare-selfie.js, flexicare-avatar.js,
       flexicare-onboarding.js, flexicare-quiz.js, flexicare-reveal.js,
       then the dev-only slider.js + orb-tuner.js
  2. Build the new avatar page per the attribute contract at the top of
     src/flexicare-avatar.js: [data-avatar] wrapper, the two sibling pill rows,
     [data-avatar-grid] holding nine [data-avatar-slot="1".."9"] cards each with an
     [data-avatar-image] inside, [data-avatar-next]/[data-avatar-back] in the nav, and the
     optional -loading/-empty/-error elements.
  3. A plain link from the selfie page to it (no attribute needed — Barba handles it and
     the selfie controller stops the camera on leave).
  4. data-progress on the new container (the design shows roughly a quarter).

## 2026-08-19 — Page identity can be overridden per page (nav hidden on the reveal)
- src/transition.js, ARCHITECTURE.md
- pageIdentity() now honours data-page-id on the INCOMING Barba container and falls back
  to the URL as before. data-page-id="landing" on a container therefore gives that page
  the landing page's chrome — which is how /meet-your-two-selves keeps the nav collapsed.
  Read from data.next.container so it applies on the way in, not a frame late.
- WEBFLOW SIDE (done + tested live): data-page-id="landing" is on the /meet-your-two-selves
  Barba container. Nothing else changed; data-show-except stays "landing" on the nav
  wrapper. Because the nav is hidden there, that page's CTA lives INSIDE the container.

---

## 2026-08-18 — Meet your two selves: the archetype reveal page (replaces /loading)
- NEW src/flexicare-reveal.js; src/flexicare-core.js, src/flexicare-onboarding.js,
  src/flexicare-quiz.js; NEW docs/api-contract.md; CLAUDE.md, ARCHITECTURE.md, README.md
- The routing quiz now goes straight to /meet-your-two-selves — there is no /loading page.
  The new controller confirms the archetype (recovering it from the session on a hard
  reload), personalises the copy, shows the per-archetype [data-reveal-for] variants, and
  polls GET /sessions/{id}/images for the generated with/without-cover pair. The images
  never block: the copy and the CTA are live immediately, and PENDING/FAILED/timeout all
  fall through to [data-reveal-images-fallback].
- Per-archetype card copy comes from a COPY DATABASE, not duplicated cards: one hidden
  [data-reveal-copy] embed of [data-copy-for="A|B|C|*"] blocks whose [data-copy] slot
  names map to the element IDs on the page (#with-cover-heading, #with-cover-text, and
  the without- pair). Repeat a slot name and that target cycles through the items on one
  shared timer (data-reveal-cycle / -cycle-fade), so both cards change together.
- core: FC.firstName + FC.setFirstName (onboarding stores the name; resetJourney clears it,
  along with the new FC.images). quiz: the data-quiz-done fallback is now
  /meet-your-two-selves instead of /loading.
- docs/api-contract.md is the backend developer's handover — every endpoint, payload and
  error code, including the photo/image flow. Read it before touching Flexicare.api().
- WEBFLOW SIDE: the script LIST changed — add flexicare-reveal.js to the footer (after
  flexicare-quiz.js, before slider.js). New page /meet-your-two-selves needs [data-reveal]
  and the data-reveal-* attributes, the copy embed, and IDs on the four copy elements;
  set data-reveal-next to the FLEX quiz page slug, and
  data-quiz-done="/meet-your-two-selves" on the /archetype [data-quiz] wrapper.

---

## 2026-08-18 — Orb: final tuned values, and the warp/refraction trade-off
- ARCHITECTURE.md, CLAUDE.md, src/orb-motion.js (header only — no behaviour change)
- Values tuned live via ?orbtune and now set as attributes in Webflow:
    orb-container   data-orb-path-x=26 -y=23 -duration=17 -spin=40
    orb-wrapper     data-orb-squish-radius=0 -scale=0.06 -skew=2 -duration=9.5
                    data-orb-warp-scale=15 -detail=0.004 -speed=4 -drift=165 -pulse=0.05
    both glows      data-orb-float-x=18 -y=16 -scale=0.1 -duration=50 -spin=300
                    -radius=22 -follow=1.1
  Defaults were omitted deliberately (path-direction, squish-organic/-uniform,
  warp-octaves/-smooth), so any attribute that IS present is a deliberate departure.
- CONFIRMED IN BROWSER, and accepted: `data-orb-warp` sits on `orb-wrapper`, an ancestor of
  `glass-orb`, and this HAS switched the glass refraction off — a `filter` makes an element
  a backdrop root, so the glass has nothing behind it left to refract. The predicted
  consequence is real.
- Kept anyway, on purpose: the orb is the bottom-most layer of the page, so nothing
  underneath it is worth refracting, and warping the wrapper deforms the glass and both
  glows together as a single shape, which is the intended look. orb-motion.js logs its
  placement warning on every load — **that warning is expected here and must not be
  "fixed"** by moving the warp onto glass-orb, which would restore a refraction of nothing
  and break the unified silhouette. Recorded in CLAUDE.md, ARCHITECTURE.md and the
  orb-motion.js header so a fresh session can't undo it by following the general rule.
- Note the two glows now share follow=1.1; the earlier per-glow 0.4/0.55 split was
  flattened by tuning them through the panel's "All" mode.
- Also tidied CLAUDE.md: orb-motion.js had been wedged under item 4 without its own number,
  and the two dev tuners were listed in the wrong order relative to the Webflow footer.
- WEBFLOW: attributes already applied. No footer change.

## 2026-08-18 — NEW src/orb-tuner.js: live tuner for orb-motion
- NEW src/orb-tuner.js; README.md, ARCHITECTURE.md, CLAUDE.md, docs/hosting-and-publishing.md
- Dev-only control panel gated behind `?orbtune` (or `?tune`, so it can sit beside the
  glass tuner; its FAB is offset so they don't overlap). Force with
  localStorage.setItem('orbTunerAlways','1').
- Sliders for every data-orb-* knob across path / squish / warp / float, seeded from the
  attributes the elements already carry, so it opens showing the truth rather than defaults.
- orb-motion reads attributes only when it attaches, so each edit writes the attribute then
  calls OrbMotion.kill(el) + refresh(). Motion therefore RESTARTS on every change — a
  visible jump mid-drag — in exchange for the panel and a fresh load agreeing exactly.
- A group's dropdown can attach a behaviour to an element that carries no attribute yet
  (so warp can be trialled before committing it in Webflow). Nothing is ever removed from
  another element.
- "Copy attributes" emits a per-element paste-ready list with defaults omitted.
- Panel carries the placement rules we kept hitting: squish on the shared ancestor, warp on
  the glass ITSELF, and a note that Float's "all" mode flattens per-element differences.
- init() is idempotent — found via a jsdom harness where a double boot stacked two panels
  and re-seeded state mid-drag.
- WEBFLOW: **the footer file list changed** — add orb-tuner.js last, after slider.js.

## 2026-08-18 — orb-motion: guard against a misplaced warp decimal point
- src/orb-motion.js
- `data-orb-warp-detail` is feTurbulence's baseFrequency, in cycles per PIXEL, so it lives
  in the thousandths. A value of 0.6 gives a noise wavelength of ~1.7px — per-pixel grain
  that cannot form a lobe at any displacement scale. Clamp above 0.08 and warn with the
  computed wavelength and the usable range, since this is almost always a misplaced
  decimal point rather than an intent.
- Header now states explicitly that data-orb-warp belongs on glass-orb, NOT on
  orb-wrapper (which is where the squish goes) — the two are not interchangeable — and
  that warping the glows means giving them their own group beside glass-orb, not wrapping
  it.
- Still open: whether `filter` and `backdrop-filter` coexist on the SAME element in
  Chrome. Untested so far, because the attribute had been on the wrapper. (Later resolved
  as moot — see the "final tuned values" entry: the warp stays on the wrapper by choice, so
  the same-element case is never exercised in this project.)

## 2026-08-18 — orb-motion: fix warp rendering as grain
- src/orb-motion.js, ARCHITECTURE.md
- data-orb-warp produced per-pixel grain along the rim instead of warping. feTurbulence
  writes noise into ALL FOUR channels including alpha, and filter results are stored
  premultiplied, so the noisy alpha was scaling the R/G that feDisplacementMap reads for
  x/y — turning a smooth displacement field into random per-pixel offsets. Visible only
  at the rim because that's the sole high-contrast edge.
- Inserted feColorMatrix after the turbulence to force alpha to 1, RGB untouched.
- New optional `data-orb-warp-smooth` (blur on the field, px). Placed before the offset so
  its inputs stay static and cacheable. Costs amplitude — blurring averages the channels
  toward 0.5, i.e. zero displacement — so lowering `-detail` is usually the better way to
  get broader lobes.
- CORRECTION (this claim was wrong when first written): this entry originally said the
  browser had confirmed `filter` and `backdrop-filter` coexisting on one element. It had
  not. The attribute was on orb-wrapper, an ANCESTOR of the glass, so the same-element
  case was never exercised. That question is still open — see the entry above.
- WEBFLOW: no change beyond what the previous entry described.

## 2026-08-18 — orb-motion: data-orb-warp, true non-affine silhouette
- src/orb-motion.js, ARCHITECTURE.md
- scale/skew can only turn a circle into a leaning ellipse; a lava-lamp silhouette has
  CONCAVE bulges. New opt-in `data-orb-warp` gets there with an SVG feDisplacementMap
  applied via `filter`, which warps the element's finished rendering — refracted backdrop,
  rim, specular, edge — as one already-composited image. Same reason skew is safe (it
  happens after the glass draws itself), minus the affine restriction.
- Chain is feTurbulence (STATIC, so the browser caches the noise field) -> feOffset
  (animated, scrolls the cached noise so bulges travel almost free) -> feDisplacementMap.
  Animating baseFrequency/seed instead would recompute turbulence every frame.
- Drift uses the same closed harmonic loop as PATH, so it is seamless. Verified: noise
  offset returns exactly to its start, turbulence attributes untouched during animation,
  kill() removes both the CSS and the filter node.
- Warns if placed on an ANCESTOR of a glass element: a filter makes an element a backdrop
  root, which would leave the glass nothing behind it to refract.
- The injected <svg> defs host is tagged `data-js-injected` so transition.js's shell class
  sync skips it.
- NOT YET BROWSER-VERIFIED: whether Chrome honours `backdrop-filter` on an element that
  also carries `filter`. If the glass goes flat when the warp is added, that interaction
  is the cause — fall back to warping a glow group only.
- WEBFLOW: no new file. Opt in by adding `data-orb-warp` to glass-orb (plus
  `data-orb-warp-scale` / `-detail` to taste).

## 2026-08-18 — orb-motion: organic multi-timescale warp
- src/orb-motion.js, ARCHITECTURE.md
- New `data-orb-squish-organic`, **default on** (visual change on deploy, no attribute
  edit needed; set "0" to restore the old stepped mode). Scale and skew now come from one
  constant-speed driver as a sum of three sines at harmonic ratios (1,2,5 for scale;
  1,3 for skew), weights summing to 1 so the swing still peaks at the stated amplitude.
  Stepped mode eased to one random target at a time, so everything moved at one tempo;
  summed harmonics give a slow swell with faster ripples on top. Verified: stays inside
  the amplitude, seamless at the wrap, 6 direction changes per cycle vs 2 for one sine.
- Cheaper as well — one driver tween per element instead of an endless chain.
- A lava lamp is mostly NON-affine, and affine transforms of a circle are always
  ellipses (nesting more squish layers cannot help: affine of affine is affine), so the
  bulging has to come from inside the membrane. Documented the route: float-radius on
  the glows plus a gooey `filter: blur() contrast()` group — which must NOT be an
  ancestor of the glass element, since a filter creates a containing block and breaks
  backdrop-filter.
- WEBFLOW: no new file, no required attribute change. Optional: raise
  `data-orb-squish-duration` to ~9 for a slower lava-lamp tempo, add
  `data-orb-float-radius="24"` to the glows, and wrap the glows in a filtered
  `glow-group` div (sibling of glass-orb, painted behind it) for the merge effect.

## 2026-08-18 — orb-motion: inner layers follow the warp
- src/orb-motion.js, ARCHITECTURE.md
- The glows are SIBLINGS of glass-orb, so with the squish on glass-orb they warped
  independently of it and spilled outside. Fix is structural: the squish belongs on
  orb-wrapper, the ancestor they share, so one affine warp deforms glass and glows as a
  single unit; a static border-radius 50% + overflow hidden there is what actually
  contains them.
- New `data-orb-float-follow="<seconds>"` — inner layers LAG the warping ancestor so
  they read as liquid rather than a decal. A child already inherits the host transform,
  so the writer sets the ratio of a smoothed copy of the host's deform to its live one
  (`inherited * (lagged/live) == lagged`), cancelling the inheritance and substituting
  the lagged value. Skews subtract rather than divide (additive composition). Exponential
  dt-based smoothing, so identical feel at 60 and 120Hz. Warns if no squishing ancestor.
- Follow also squeezes the wander amplitude along whichever axis the host is narrowing,
  so a layer stays proportionally placed inside instead of being clipped away.
- The breathe tween now runs through a proxy under follow, since the follow writer owns
  scaleX/scaleY and a tween on `scale` would fight it for the same two properties.
- Runs on gsap.ticker; kill() removes the ticker callback.
- WEBFLOW: no new file. Move `data-orb-squish*` from glass-orb to orb-wrapper; give
  orb-wrapper `border-radius: 50%` + `overflow: hidden`; add
  `data-orb-float-follow="0.4"` to green-orb-glow / blue-orb-glow.

## 2026-08-18 — orb-motion: skew, so the warp survives the glass fix
- src/orb-motion.js, ARCHITECTURE.md, CLAUDE.md
- Killing the radius morph on the glass node also killed the abstract shape warping,
  because scale alone only ever yields an axis-aligned ellipse. The real constraint is
  affine vs non-affine, not transform vs radius: border-radius changes the silhouette
  while the baked map still describes a circle, whereas scale and skew transform the
  element's finished rendering — rim and displacement map together — so they cannot
  desync from each other.
- New `data-orb-squish-skew` (degrees, own slower clock). Shearing a scaled circle makes
  the ellipse lean and roll, which reads as a warping blob. Safe on glass.
- The glass warning is now scoped to the radius morph only; non-uniform scale is fine.
- Each endless chain now holds its live tween in a named slot rather than a capped
  array, so a third chain can't evict another's handle and leave stop()/start() with
  nothing to pause.
- WEBFLOW: no new file. On glass-orb drop `data-orb-squish-uniform` and set
  `data-orb-squish-scale="0.05"`, `data-orb-squish-skew="5"` (keep radius at 0).

## 2026-08-18 — orb-motion: keep the squish off the glass node
- src/orb-motion.js, ARCHITECTURE.md, CLAUDE.md
- Morphing a `data-liquid-glass` element desyncs its refraction rim from its painted
  edge: glass bakes its displacement map from offsetWidth/offsetHeight (transforms
  don't change those) and a SINGLE borderTopLeftRadius fed to makeSDF as a uniform
  rounded rect, so 7 of the 8 border-radius values are invisible to it and scaleX/scaleY
  squash the finished backdrop-filter output. Nothing rebuilds either — a transform
  isn't a resize, so ResizeObserver never fires.
- New `data-orb-squish-uniform="1"` — scales both axes together, the only kind of
  scale a baked glass rim survives.
- New `data-orb-float-radius` — the blob morph on the soft glow layers, where there's
  no rim to fall out of register. Writes border-radius, not transform, so it composes
  with the float wander.
- Warns on the console if a glass node is given a radius morph or a non-uniform scale.
- WEBFLOW: no new file. On glass-orb set `data-orb-squish-radius="0"`,
  `data-orb-squish-uniform="1"`, `data-orb-squish-scale="0.03"`; add
  `data-orb-float-radius="20"` to green-orb-glow / blue-orb-glow.

## 2026-08-18 — Fluid orb motion on the landing page
- NEW src/orb-motion.js; README.md, ARCHITECTURE.md, CLAUDE.md, docs/hosting-and-publishing.md
- Adds `window.OrbMotion`: `data-orb-path` (outer wander + slow spin),
  `data-orb-squish` (8-value border-radius morph + counter-phase scaleX/scaleY for a
  squishy-bubble surface), `data-orb-float` (inner glows wandering on their own clocks).
  Layered one transform-writer per DOM level so they compose instead of fighting.
- First module that animates INSIDE the Barba container: it re-scans on
  `barba.hooks.afterEnter` and kills tweens for elements no longer in the document.
- WEBFLOW: the footer file list changed — add `orb-motion.js` right after
  `background-motion.js`. Then add the attributes in the Designer:
  orb-container → `data-orb-path`, orb-wrapper → `data-orb-squish` (+ `overflow: hidden`),
  green-orb-glow / blue-orb-glow → `data-orb-float`.

## 2026-08-14 — Docs brought in line with the code and the new hosting
- ARCHITECTURE.md, CLAUDE.md, CHANGELOG.md
- ARCHITECTURE.md § transition.js now documents the shell-persistence machinery:
  the leave placeholder, syncShellClasses' two passes, isInjected filtering, and the
  hard rules (never match by class; mark injected nodes with an ATTRIBUTE; counts must
  be equal, never Math.min; <body> is the Barba wrapper so never anchor a positional
  walk there; shell structure must match across pages).
- CLAUDE.md: fixed two stale lines (jsDelivr → Cloudflare Workers; dropped the
  "pasting to CodeSandbox" instruction) and added the shell-persistence gotchas.
- No code change.

## 2026-08-14 — Class sync: anchor on ancestor chains, not sibling position (v1.0.5)
- src/transition.js, src/glass.js, src/slider.js, src/flexicare-selfie.js
- Symptom: v1.0.4's count-equality guard fired at the WRAPPER root (16 live children
  vs 15), so it bailed immediately and no classes synced at all — the 1.5rem nav gap
  came back.
- Cause: data-barba="wrapper" is on <body>, and glass.js appends its <svg> defs holder
  there. Any body-level injected node guarantees a count mismatch at the root, which
  under the guard means "sync nothing".
- Fix, pass 1: syncAncestors() walks UP from anchors carrying a unique attribute
  (container, [data-barba-sync], [data-nav-reveal], [data-show-except],
  [data-progress-bar]) copying classes along the ancestor chain. Walking upward never
  looks at siblings, so injected nodes cannot affect it. This is what fixes the shell.
- Fix, pass 2: the guarded positional walk now starts at the CONTAINER'S PARENT rather
  than the wrapper, so it still catches persistent siblings like top-section-wrapper
  without being killed by body-level injections.
- All script-injected nodes are now marked with attributes (data-lg-defs on glass's
  svg, data-js-injected on the tuner fab/panel and the selfie file input) and filtered
  via isInjected(). Attributes, not classes — the sync rewrites classNames.
- No Webflow change needed.

## 2026-08-14 — Fix blank band above content caused by class-sync misalignment (v1.0.4)
- src/transition.js, src/glass.js
- Symptom (regression from v1.0.3): after navigating, an empty div with class
  padding-global appeared above the content, adding a large blank band. Gone on refresh.
- Cause: glass.js inserts <div class="lg-layer"> as the FIRST child of every glassed
  element. That node exists in the live DOM but not in the parsed next document, so
  inside glass-background-container the live children were [lg-layer, padding-global]
  against [padding-global]. walkShellClasses matched by Math.min and paired
  lg-layer <-> padding-global, copying padding-global's class onto the glass overlay.
- Fix: matchableKids() now also drops glass overlays, and walkShellClasses() REQUIRES
  the two child counts to be equal — a mismatch abandons that branch (stale classes)
  instead of misaligning. Math.min was the real defect: it let a length mismatch
  silently shift every later sibling.
- glass.js now tags the overlay with data-lg-layer as well as .lg-layer, because the
  class sync overwrites classNames and a class is not a dependable marker.
- No Webflow change needed.

## 2026-08-14 — Sync persistent shell classes across navigations (v1.0.3)
- src/transition.js
- Symptom: the 1.5rem flex gap above button-navigation-wrapper was missing after
  navigating, but correct after a hard refresh.
- Cause: Barba only swaps the container. The shell around it persists as whatever
  the FIRST loaded page shipped, so per-page CLASSES on it go stale. Landing on the
  site root left the shell as landing-glass-container (gap 0, justify-content
  center) on pages whose own markup says glass-container (gap 24px, flex-start).
  A refresh "fixed" it only because Webflow then served the correct shell.
- Fix: syncShellClasses() walks the persistent tree on each navigation and copies
  each element's class list from its positional counterpart in the next page's
  document. Skips the container subtree (Barba owns it) and [data-barba-sync]
  subtrees (innerHTML swap owns those, and their buttons carry runtime state
  classes). Containers are excluded from positional matching because two exist
  mid-transition. Abandons a branch on tagName mismatch rather than guessing.
- No Webflow change needed. REQUIREMENT: keep the shell's STRUCTURE identical
  across pages (same nesting and element order) — only classes may differ.

## 2026-08-13 — Fix persistent siblings snapping during page transitions (v1.0.1)
- src/transition.js
- Barba inserts the next container only AFTER leave() resolves, but beginOverlap()
  pulled the leaving container out of flow at the START of leave(). For the length
  of the leave animation the shared parent (content-flex-wrapper) had a hole in it,
  so persistent siblings — top-section-wrapper above the container — reflowed into
  the vacated space and snapped back when the next container landed.
- beginOverlap() now parks a rigid, hidden placeholder (same box + margins,
  flex:0 0 auto) in the container's slot; beforeEnter() removes it the moment the
  real container is inserted. endOverlap() removes it as a backstop.
- No Webflow change needed. The placeholder carries data-barba-placeholder for
  debugging only.
- Also added _headers (Cloudflare cache rules) as part of moving hosting
  off pinned jsDelivr tags — see docs/hosting-and-publishing.md.

## 2026-08-13 — Hosting moves to Cloudflare Workers; no more footer pastes
- Added _headers, wrangler.jsonc, .assetsignore
- Renamed docs/git-and-jsdelivr.md → docs/hosting-and-publishing.md and rewrote it
- Updated CLAUDE.md + README.md to describe the new workflow
- Why: pinned jsDelivr tags meant pasting a new footer into Webflow on every
  release. Unpinning was not an option — jsDelivr serves unpinned URLs with
  max-age=604800, so returning visitors would hold stale JS for 7 days.
- Now: Cloudflare Workers serves the repo root from main, with
  Cache-Control: public, max-age=0, must-revalidate on /src/* — push and it's live.
- WEBFLOW CHANGE (one time): footer script URLs move from
  cdn.jsdelivr.net/gh/KentonVos/flexicare@vX.Y.Z/src/... to
  https://flexicare.kenton-323.workers.dev/src/... — same files, same order.
  After this paste, the footer only changes if the file LIST changes.
- main is now live on every push. Version tags still cut as a rollback escape hatch.

## 2025-08-13 — Set up repo, context docs, and move hosting to Git + jsDelivr
- Added CLAUDE.md, ARCHITECTURE.md, README.md, this CHANGELOG, .gitignore
- Captured the real Webflow head snippet in docs/webflow-head-snippet.md
- Added docs/git-and-jsdelivr.md (setup + publish + rollback)
- Moved the nine scripts into src/ as the source of truth
- Hosting moves from CodeSandbox to jsDelivr (served from GitHub, version-tagged)
- No script behaviour changed; footer URLs change to cdn.jsdelivr.net/gh/USERNAME/flexicare@vX.Y.Z/src/...
- Webflow footer: moved dev-only slider.js (tuner) to the end; order otherwise unchanged (verified correct)
