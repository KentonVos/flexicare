# CLAUDE.md — Flexicare custom code

<!-- Claude Code reads this file automatically at the start of every session.
     Keep it short and behavioural. Deep detail lives in ARCHITECTURE.md,
     which you should read on demand (it is NOT auto-loaded). -->

## What this project is

Custom JavaScript for a **Webflow** multi-page funnel called **Flexicare**. Webflow
is the front end (structure + styling + the `data-*` attributes on elements). These
scripts add all the behaviour: a liquid-glass UI, Barba.js page transitions, and a
quiz that talks to a backend API.

The scripts are pushed to **GitHub** and served to Webflow by **Cloudflare Workers** via
`<script src>` tags. This local folder is the **source of truth**. See "Editing +
publishing workflow" below.

- **Plain ES5-style JavaScript.** No build step, no framework, no npm, no TypeScript,
  no JSX. Match the existing style (IIFEs, `var`, no optional chaining).
- **Everything is attribute-driven.** The scripts find elements by `data-*` attributes
  set in the Webflow Designer. Never assume a class or ID; read the attribute contract.

## The files (and the load order that MUST be preserved)

External libraries load first in Webflow's head/footer: **GSAP**, then **@barba/core**.
Then these, in this exact order (order is load-bearing — see ARCHITECTURE.md):

1. `src/glass.js` — `window.LiquidGlass`. The liquid-glass effect.
2. `src/transition.js` — `window.PageTransition`. **The only file that calls `barba.init()`.** Owns page transitions. Needs Barba, GSAP, LiquidGlass.
3. `src/text-reveal.js` — `window.TextReveal`. Word-by-word headline reveals; driven by transition.js.
4. `src/background-motion.js` — `window.BackgroundMotion`. Background glow drift/orbit.
5. `src/orb-motion.js` — `window.OrbMotion`. The landing-page orb: path + squish + warp +
   float. Unlike background-motion it targets elements INSIDE the Barba container, so it
   re-scans on `afterEnter` and prunes tweens for removed nodes.
6. `src/flexicare-core.js` — `window.Flexicare` (aka `FC`). The persistent brain: config, session id, buffered selfie, API helper, journey reset. **First of the Flexicare scripts.**
7. `src/flexicare-onboarding.js` — `/onboarding` page controller.
8. `src/flexicare-selfie.js` — selfie-capture page controller.
9. `src/flexicare-avatar.js` — avatar-picker page controller (the alternative to the
   selfie: race/gender filters + a 3×3 grid from `GET /avatars`). Buffers the chosen
   `avatar_id`; **onboarding** is what sends it.
10. `src/flexicare-quiz.js` — the quiz renderer for BOTH `/archetype` (ROUTING) and
    `/flexicare` (FLEX). `/flexicare` is a Webflow duplicate of `/archetype`; only the
    `[data-quiz]` config attributes differ (`data-quiz-stage="FLEX"`, `-done`, `-back`,
    `-progress-start/-end`).
11. `src/flexicare-reveal.js` — `/meet-your-two-selves`, the archetype reveal (the page
    that replaced `/loading`): recovers/confirms the archetype, personalises copy, and
    polls for the generated with/without-cover image pair.
12. `src/slider.js` — **NOT a content slider.** This is the "Liquid Glass Tuner", a dev-only control panel gated behind `?tune` in the URL. Ignore it for production changes unless the task is about tuning glass presets.
13. `src/orb-tuner.js` — dev-only orb-motion control panel, gated behind `?orbtune`
    (or `?tune`, so it can sit beside the glass tuner). Writes the `data-orb-*` attributes
    live and hands back a paste-ready list. Ignore for production changes.

## Things that will bite you if you forget them

- **`barba.init()` happens once, in `transition.js`.** Never add a second one.
- **Load order matters** because Barba hooks fire in the order scripts register them.
  `transition.js` must run before the page controllers (its `afterEnter` re-scans
  glass before they attach listeners). `flexicare-core.js` must run before the other
  Flexicare scripts.
- **There is an external head snippet this code depends on** but which is NOT in this
  repo: it sets `window.__fcLayout` (viewport/layout mode) before first paint, in
  Webflow → Site Settings → Custom Code → **Head**. If `Flexicare.layout.forced` is
  `false` on a large tablet, that snippet is missing. See `docs/webflow-head-snippet.md`.
- **There is NO `/loading` page.** The routing quiz goes straight to
  `/meet-your-two-selves` (`flexicare-reveal.js`), which resolves the archetype and polls
  for the generated images *while the copy is already on screen*. Don't reintroduce a
  blocking loading screen — the reveal page never waits on images to render.
- **The API base URL is STAGING** in `flexicare-core.js`
  (`api-staging-discovery.injozitech.com`). It must be swapped to production before
  go-live. This is the single config touchpoint for the backend. The **full backend
  contract** (every endpoint, payload, error code, the photo/image flow) is in
  `docs/api-contract.md` — read it before touching anything that calls `Flexicare.api()`.
- **The photo step has TWO paths and they are mutually exclusive.** A selfie
  (`Flexicare.photo`, a Blob) or a picked avatar (`Flexicare.avatar`, just an id).
  Setting either one clears the other in `flexicare-core.js`, so whichever the user did
  LAST is what ships. **Neither is sent by the page that captures it** — both need a
  session id, which only exists after `/onboarding` submits, so onboarding sends whichever
  is buffered (presign→PUT→confirm, or `PATCH …/photo/avatar`). Downstream nothing
  branches: the reveal page polls `GET /sessions/{id}/images` either way. **Only the
  selfie generates.** An avatar's with/without-cover pair is admin-approved and stored
  against the avatar, so the avatar `PATCH` just copies it onto the session and `/images`
  is `READY` on the first poll — "developing…" and `FAILED` are selfie-path states. Also:
  a catalog avatar is **selectable ⟺ its `url` is present**, not when `status` says
  `READY` (the url is only issued once the scenario pair is approved too). The picker
  **displays** a different image set from the one it **selects** from: transparent webp
  renders from `GET /avatars/web`, joined to `GET /avatars` on `id`. So an unbaked slot
  shows a dimmed face rather than an empty card, and "unavailable" means *not pickable*,
  never *no image*.
- **The buffered selfie lives in memory only** (`Flexicare.photo`). It survives Barba
  navigations but NOT a hard page reload. That's why the controllers always navigate
  with `barba.go()`, never `window.location`. Don't "helpfully" change a `barba.go()`
  to a normal redirect.
- **The orb's `data-orb-warp` is on `orb-wrapper` ON PURPOSE, and that has switched the
  glass refraction OFF.** A `filter` makes an element a backdrop root, so a filtered
  ancestor leaves `glass-orb` with nothing behind it to refract. This was measured, not
  guessed, and accepted: the orb is the bottom-most layer, so there is nothing underneath
  worth refracting, and warping the wrapper deforms the glass and both glows as one shape.
  `orb-motion.js` warns about this placement on every load — **the warning is expected
  here; do not "fix" it** by moving the warp onto `glass-orb`.
- **Never animate `border-radius` on a `data-liquid-glass` element.** Glass bakes a
  displacement map from the layout box plus ONE corner radius, so a morphing silhouette
  leaves the refraction rim describing a circle it no longer matches — and per-frame
  rebuilds are too expensive to be an option (that's what `LiquidGlass.freeze()` exists
  for). Affine deforms (`scale`, `skew`) are fine: they transform the finished rendering,
  rim and map as one unit. So warp glass with scale + skew, and put any true silhouette
  morph on a non-glass sibling or the soft glow layers. See ARCHITECTURE.md § orb-motion.js.
- **Glass owns `transform`.** On any element with `data-liquid-glass` that also needs
  to animate in, use `data-anim-fade` (opacity only), never `data-anim` (which moves
  it). And never put `data-lg-press`/`data-lg-tilt` on the same element as a Webflow
  transform interaction.
- **Only the container swaps; the whole shell persists.** Anything outside
  `data-barba="container"` is whatever the FIRST page loaded shipped — including its
  per-page CLASSES. `transition.js` fixes this (`syncShellClasses` + a leave-transition
  placeholder), and three separate bugs came from it. Two rules if you touch that code:
  never match elements by class (classes are what differ), and mark anything you inject
  into persistent DOM with `data-js-injected` so the sync skips it. Full notes in
  ARCHITECTURE.md § transition.js.
- **The shell's STRUCTURE must match across pages** (same nesting, same element order,
  same tag names); only classes may differ. Adding a wrapper div on one page only will
  silently stop that branch from syncing. If you change shell structure in Webflow, do it
  on every page. The canonical tree is in ARCHITECTURE.md § transition.js — ONE extra
  level is enough to break every page after the first, because the ancestor walk goes
  lockstep and off-by-one, pasting every class one level from where it belongs. Symptoms
  cascade and look unrelated, so don't chase them individually: load any page with
  `?fcdebug` and read the CHAIN block. Anything PAGE-SPECIFIC must also live inside
  `data-barba="container"` or Barba never brings it across (the panel's STRANDED line).
- **During a swap BOTH containers are in the DOM, so no controller may look up
  its own elements document-wide.** `document.getElementById` / `document.querySelector`
  return the FIRST match in document order, which can be the OUTGOING container — the
  pages are structurally identical, so it is a coin toss. Two bugs came from this on the
  reveal page alone (2026-08-24): the copy was written into the dying container, and every
  controller's `resolveWrap()` fell back to `document`, so the QUIZ controller initialised
  on the reveal page, decided the stage was already complete, and fired a second
  `barba.go()` — the destination ran its entrance animation, init and skeleton twice.
  Rules: resolve within the incoming container (or `state.wrap`), filter to nodes that are
  actually attached, and never navigate to the page you are already on (`samePath()`).
- **The click model is event delegation.** Controllers attach ONE listener to
  `document` and re-resolve the target by attribute at click time. This is deliberate
  (it survives glass rebuilds and Barba swaps). Don't refactor it to attach listeners
  to specific button nodes — that was the old, broken approach.

## Editing + publishing workflow (Git + Cloudflare)

This folder is a **Git repo pushed to GitHub**; **Cloudflare Workers** serves the files to
Webflow straight from `main`. Full setup and rationale in `docs/hosting-and-publishing.md`.
The short version:

1. Edit the file(s) here in VS Code with me (Claude Code).
2. Ask me to **commit and push** — I run the git commands.
3. Cloudflare auto-deploys in ~1 min. Hard-refresh. **Nothing to paste into Webflow.**
4. Add a line to `CHANGELOG.md`.

Live base URL: `https://flexicare.kenton-323.workers.dev` (e.g. `/src/glass.js`).

Rules for me when publishing:
- **`main` IS live.** Every push ships immediately to the real site — there is no
  commit-now-publish-later gap. Don't push half-finished work to `main`; use a branch
  (Cloudflare gives each branch its own preview URL).
- **The Webflow footer only changes if the file LIST changes** (a script added, removed,
  or renamed). Content changes need no Webflow step. Don't hand over a footer block
  unless the list actually changed — it's noise, and pasting a stale one can pin the
  site to old code.
- Still **tag meaningful releases** (`v1.0.2`, ...) — tags are the emergency escape
  hatch, since jsDelivr serves every tag permanently.
- If a release broke the site: normally `git revert && git push`. If it's urgent, offer
  to point the footer at a known-good jsDelivr tag for an instant fix — and remind the
  human to put the footer back afterwards, or future pushes will silently do nothing.
- `_headers` is what makes updates instant (`max-age=0, must-revalidate`). If someone
  raises that value, unpinned URLs start serving stale code — don't.
- The repo is **public**; never commit API keys, tokens, or secrets.

Test on the **published or preview URL**, not the Designer — the camera (selfie page) and
Barba both need a real `https` page. Hard-refresh (Cmd/Ctrl+Shift+R) after publishing.

## How to work with me on this

- For anything non-trivial, read `ARCHITECTURE.md` first — it has the module details,
  data flow, and the full Webflow attribute contracts.
- Keep changes small and reviewable. There is no paste step any more — a push is the
  publish — so prefer one coherent change per commit.
- Preserve the existing comment blocks at the top of each file — they are the contract
  for the Webflow side and for future sessions.
- If you change an attribute name or add a new `data-*` hook, say so explicitly in your
  summary so I know to update the element in the Webflow Designer.
