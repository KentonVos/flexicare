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
7. `src/flexicare-kiosk.js` — `window.Flexicare.kiosk`. Device pairing, heartbeat and
   idle reset for the in-store tablets. **Must load before onboarding** — it owns the
   device token that `POST /sessions` needs. Completely inert on the public site.
8. `src/flexicare-onboarding.js` — `/onboarding` page controller.
9. `src/flexicare-selfie.js` — selfie-capture page controller.
10. `src/flexicare-avatar.js` — avatar-picker page controller (the alternative to the
   selfie: race/gender filters + a 3×3 grid from `GET /avatars`). Buffers the chosen
   `avatar_id`; **onboarding** is what sends it.
11. `src/flexicare-quiz.js` — the quiz renderer for BOTH `/archetype` (ROUTING) and
    `/flexicare` (FLEX). `/flexicare` is a Webflow duplicate of `/archetype`; only the
    `[data-quiz]` config attributes differ (`data-quiz-stage="FLEX"`, `-done`, `-back`,
    `-progress-start/-end`).
12. `src/flexicare-reveal.js` — `/meet-your-two-selves`, the archetype reveal (the page
    that replaced `/loading`): recovers/confirms the archetype, personalises copy, and
    polls for the generated with/without-cover image pair.
13. `src/flexicare-product.js` — `/flexicare-product`, the recommendation page. Renders
    the plan the server picked from `Flexicare.result` (the `/finish` response): copy keyed
    on **archetype AND product** (`data-copy-for="A:PLUS"`), plus `product_label` and the
    price from `recommended_price_cents`.
14. `src/flexicare-spin.js` — `/spin-to-win`, the prize wheel. The one KIOSK-ONLY page:
    a `WEB` session gets a hard 409 from `POST /spin`. Draws the wheel as SVG from
    `GET /prizes/wheel` (segment count/order/labels/colours are all admin data) and
    animates to the `segment_index` the SERVER returns — there is no client-side
    randomness here and there must never be.
15. `src/slider.js` — **NOT a content slider.** This is the "Liquid Glass Tuner", a dev-only control panel gated behind `?tune` in the URL. Ignore it for production changes unless the task is about tuning glass presets.
16. `src/orb-tuner.js` — dev-only orb-motion control panel, gated behind `?orbtune`
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
- **Glass does NOT own `position` any more — but it did, and that mattered.** A glass
  host needs a non-static position to contain its overlay; `absolute`/`fixed`/`sticky`
  all qualify, so glass.js now only forces `relative` on hosts that were `static`
  (marking them `data-lg-static`). If you see an element jump into normal flow when
  glass is added, that's the old behaviour and it's a bug, not a constraint.
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
- **The prize spin is decided at /onboarding, not at /spin-to-win.** A session can only
  spin if `POST /sessions` carried `X-Kiosk-Token` (`channel: "KIOSK"`); on a `WEB`
  session `POST /spin` is a hard 409. So the kiosk layer is a CHAIN — pair the tablet →
  token in `localStorage` → header on session create → header on spin — and breaking any
  link means the shopper completes the whole journey and is refused at the wheel. If the
  spin page keeps saying "unavailable", the session was started on an unpaired browser;
  fix it there, not on the spin page. `docs/kiosk-and-spin.md` has the whole chain.
- **Never retry a kiosk call without the header after a 401.** That silently creates a
  `WEB` session on a tablet. A 401 means the token was revoked: clear it and show the
  unpaired screen. And the inverse — **never clear the token on a network error or a
  5xx**; only a 401 does that, or flaky store wifi strands the tablet.
- **The server owns the spin outcome.** `segment_index` in the `/spin` response IS the
  result; the wheel only animates to it. Don't add client-side randomness, don't
  "pre-pick" a segment while waiting, and don't treat a second `200` from a re-called
  `/spin` as a second prize — it is idempotent and returns the same award.
- **The wheel is drawn by JS, not authored in Webflow.** `GET /prizes/wheel` decides how
  many segments there are and what they say. Webflow supplies an EMPTY square
  `[data-spin-wheel]` (it is cleared on every render) plus the pointer, hub and button
  layered over it. A hand-built seven-slice wheel breaks the first time an admin adds a
  prize. Also: no `data-liquid-glass` on the wheel stage — glass owns `transform` and
  bakes its map from the layout box, which a spinning child defeats.
- **On `/spin-to-win` the panels animate, and that decides where glass goes.** The
  wheel and the result cards are `[data-spin-when]` panels on ONE page — there is no
  second Barba navigation — and the swap between them is a scale + opacity
  cross-dissolve run from `applyWhen()`. A panel that is ALSO a glass host fades
  **without** scaling (glass owns `transform`, and its press spring resets to the
  transform captured at attach, which would wipe the tween). So the panel is a plain
  wrapper and `data-liquid-glass` goes on the card INSIDE it. `data-spin-panel-overlap`
  defaults to 0 because a cross-fade only works once the panels are stacked — siblings
  in normal flow both occupy the layout for the overlap and the page jumps. Nested
  panels skip their own motion when the parent panel is changing, or the fades
  multiply. When something here looks wrong, run `Flexicare.spin.panels()` in the
  console: it prints every panel the script can SEE plus the facts that decide the
  outcome (a panel missing from that table is one it never found).
- **Tapping spin collapses the nav, and it is NOT restored.** The spin CTA lives in the
  nav wrapper, so once the wheel turns the nav is spent and the next step is the landing
  page where it is collapsed anyway. It uses `PageTransition.nav.hide()` — a wrapper
  around the SAME `navReveal()` the landing page's `data-show-except` path uses. Use
  that, never a hand-rolled height tween: `navReveal` maintains `__navHidden`, which the
  next navigation reads to decide whether to animate, so a private tween leaves
  `applyVisibility` collapsing or reopening the nav a second time one page later. It
  returns in exactly one case — the state goes back to `ready` (429 cooldown, retryable
  error) — because the CTA is inside it.
- **The Webflow MCP connector is READ-ONLY by Kenton's instruction.** Inspect the site
  with it freely (diffing the shell tree across pages is the biggest win — see the shell
  structure rules above); never call a create/update/delete tool against the site, even
  when it would be faster. Describe the Designer change and hand it over. A bad script
  push is a one-minute `git revert`; an unpicked Designer edit is not.
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

- Kiosk mode and the prize wheel have their own guide: `docs/kiosk-and-spin.md` (the
  Webflow structure, the wheel rendering decision, and the testing checklist).
- For anything non-trivial, read `ARCHITECTURE.md` first — it has the module details,
  data flow, and the full Webflow attribute contracts.
- Keep changes small and reviewable. There is no paste step any more — a push is the
  publish — so prefer one coherent change per commit.
- Preserve the existing comment blocks at the top of each file — they are the contract
  for the Webflow side and for future sessions.
- If you change an attribute name or add a new `data-*` hook, say so explicitly in your
  summary so I know to update the element in the Webflow Designer.
