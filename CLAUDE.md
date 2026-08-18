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
   `src/orb-motion.js` — `window.OrbMotion`. The landing-page orb: path + squish + float.
   Unlike background-motion it targets elements INSIDE the Barba container, so it
   re-scans on `afterEnter` and prunes tweens for removed nodes.
5. `src/flexicare-core.js` — `window.Flexicare` (aka `FC`). The persistent brain: config, session id, buffered selfie, API helper, journey reset. **First of the Flexicare scripts.**
6. `src/flexicare-onboarding.js` — `/onboarding` page controller.
7. `src/flexicare-selfie.js` — selfie-capture page controller.
8. `src/flexicare-quiz.js` — `/archetype` quiz + later FLEX stage.
9. `src/orb-tuner.js` — dev-only orb-motion control panel, gated behind `?orbtune`
   (or `?tune`). Writes the `data-orb-*` attributes live and hands back a paste-ready
   list. Ignore for production changes.
10. `src/slider.js` — **NOT a content slider.** This is the "Liquid Glass Tuner", a dev-only control panel gated behind `?tune` in the URL. Ignore it for production changes unless the task is about tuning glass presets.

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
- **The API base URL is STAGING** in `flexicare-core.js`
  (`api-staging-discovery.injozitech.com`). It must be swapped to production before
  go-live. This is the single config touchpoint for the backend.
- **The buffered selfie lives in memory only** (`Flexicare.photo`). It survives Barba
  navigations but NOT a hard page reload. That's why the controllers always navigate
  with `barba.go()`, never `window.location`. Don't "helpfully" change a `barba.go()`
  to a normal redirect.
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
- **The shell's STRUCTURE must match across pages** (same nesting, same element order);
  only classes may differ. Adding a wrapper div on one page only will silently stop that
  branch from syncing. If you change shell structure in Webflow, do it on every page.
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
