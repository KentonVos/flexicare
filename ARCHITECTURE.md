# ARCHITECTURE.md — Flexicare custom code

Deep reference. Not auto-loaded — read it when a task touches more than one file or
needs the Webflow attribute contract. `CLAUDE.md` is the short version.

---

## 1. The big picture

Webflow renders each page as static HTML with `data-*` attributes on elements. **Barba.js**
intercepts internal link clicks and swaps the page contents *without a full reload*, so
JavaScript module state persists across "pages". That persistence is the whole trick that
makes the funnel work: the session id, the captured selfie, and the quiz answers all live
on `window.Flexicare` and survive navigation.

Two layers:

- **Engine** — reusable visual + navigation code: `glass.js`, `transition.js`,
  `text-reveal.js`, `background-motion.js`, `orb-motion.js`, and the dev-only
  `slider.js` tuner.
- **App** — the funnel itself: `flexicare-core.js` (state) plus three page controllers.

### Load order and why it's fixed

Barba lifecycle hooks fire in the order they were registered, and registration happens
when each script is evaluated. So script order = hook order.

```
GSAP                     (library)
@barba/core              (library)
glass.js                 LiquidGlass.scan must exist before transition.js uses it
transition.js            calls barba.init() ONCE; registers the transition + afterEnter(glass scan)
text-reveal.js           needs GSAP; transition.js drives its reveals
background-motion.js     needs GSAP; attaches its Barba reaction when Barba is present
orb-motion.js            needs GSAP; re-scans the new container on Barba afterEnter
flexicare-core.js        first Flexicare script; registers journey-reset afterEnter
flexicare-onboarding.js  page controller
flexicare-selfie.js      page controller
flexicare-quiz.js        page controller (also needs glass for option styling)
slider.js                dev-only tuner; needs glass.js
```

The controllers rely on `transition.js`'s `afterEnter` (which calls `LiquidGlass.scan()`)
running *before* their own `afterEnter`, so buttons are rebuilt for glass before they
attach behaviour. Registering `transition.js` first guarantees that.

---

## 2. The funnel / data flow

Pages, in order, and where state is created:

1. **Landing** (`/`) — tagged `data-journey-start`. Entering it calls
   `Flexicare.resetJourney()`, wiping any previous run (session, selfie, answers,
   archetype, result). This is what makes "start over" clean without a hard reload.
2. **Selfie** (`flexicare-selfie.js`) — camera capture with a 3-2-1 countdown and
   review/retake. The captured frame is downscaled to a square JPEG **Blob** and buffered
   in memory at `Flexicare.photo`. Nothing is uploaded here.
3. **Onboarding** (`/onboarding`, `flexicare-onboarding.js`) — collects name, WhatsApp,
   gender, consent, then on submit: (a) `POST /sessions` → stores the session id via
   `Flexicare.setSessionId` (sessionStorage, treated as a secret); (b) if a buffered selfie
   exists, uploads it (presign → PUT → confirm) in the same interaction; (c) navigates to
   `/archetype`. A failed session-create blocks; a failed image upload does not.
4. **Quiz — ROUTING stage** (`/archetype`, `flexicare-quiz.js`) — `GET /quiz?lang=en`
   once (cached on `Flexicare.quizData`). Renders the 5 routing questions one at a time.
   Each pick is `POST /sessions/{id}/answers` (upsert). After the 5th,
   `POST /routing/preview` returns the archetype (A/B/C) → stored on `Flexicare.archetype`.
   Then navigates to `data-quiz-done`.
5. **Quiz — FLEX stage** (a later page with `data-quiz-stage="FLEX"`) — same renderer,
   shows only FLEX questions whose `archetype` matches. After the last,
   `POST /sessions/{id}/finish` → `Flexicare.result`.

On a **hard reload** mid-funnel, in-memory state is gone but recoverable: answers are
rebuilt from `GET /sessions/{id}`, and a missing archetype is recovered with a preview.
The one thing that cannot be recovered is the buffered selfie (memory only) — hence
`barba.go()` everywhere.

---

## 3. Module reference

### glass.js → `window.LiquidGlass`
Attribute-driven liquid-glass effect. Hook: `data-liquid-glass`. Optional preset
`data-lg-preset="cta|nav|panel|pill"` and many `data-lg-*` knobs (refraction, lighting,
surface, interaction) — see the header comment in the file for the full list and defaults.
- Refraction (the real distortion) is **Chrome/Edge only**; Safari/Firefox get a
  blur+saturate fallback. Lighting, tint, press and tilt work everywhere.
- `press`/`tilt` animate the element's `transform`. Don't combine with a Webflow
  transform interaction on the same node (set `data-lg-press="0"` if you must).
- API: `scan()` (attach to any new `[data-liquid-glass]`), `refresh(el)`, `refreshAll()`,
  `freeze()`/`unfreeze(rebuild)` (pause displacement-map rebuilds during a size animation),
  `reloadPresets()`, `exportPresets()`, `presets`.
- Presets saved by the tuner live in `localStorage` under `lgTunerPresets` and merge on
  top of the built-in `PRESETS`. `exportPresets()` prints them ready to paste into the
  `PRESETS` object so they become permanent.

### transition.js → `window.PageTransition`
Barba + GSAP page transitions. **Calls `barba.init()` — the only place.** Markup contract:
- `data-barba="wrapper"` once around the shell; `data-barba="container"` on the one div
  whose contents swap (the literal word "container", set in the symbol).
- Inside the container, on animating elements: `data-anim="N"` (stagger order),
  `data-anim-from="up|down|left|right"`, `data-anim-distance="40"`, or `data-anim-fade="N"`
  (opacity-only — use this instead of `data-anim` on glass elements).
- Persistent, outside the container: `data-barba-sync="nav"` (a wrapper whose innards are
  swapped + cross-faded per page), `data-show-except="landing"` (hide on landing, show
  elsewhere; page identity is derived from the URL — root = "landing", everything else =
  "page"), `data-nav-reveal` (animate height instead of just opacity),
  `data-progress-bar` + `data-progress="0..1"` per container.
- Tunables in `window.PageTransition.config`.

**The persistence problem (read this before touching transition.js).** Barba swaps ONLY
the container. Everything else — the entire shell — stays as whatever the FIRST page you
loaded shipped. Three separate bugs came out of that, and three mechanisms now handle it:

1. **Leave-transition placeholder** (`beginOverlap` / `removePlaceholder`). Barba inserts
   the next container only AFTER `leave()` resolves, so pulling the leaving container out
   of flow leaves a hole in the shared parent for the whole leave animation, and
   persistent siblings reflow into it and snap back. A rigid hidden placeholder (same box
   + margins, `flex:0 0 auto`, `data-barba-placeholder`) holds the slot; `beforeEnter`
   drops it the moment the real container lands, `endOverlap` as a backstop.
2. **Shell class sync** (`syncShellClasses`). Per-page CLASSES on persistent elements go
   stale — e.g. `landing-glass-container` (gap 0, centered) vs `glass-container`
   (gap 1.5rem, flex-start). Two passes: `syncAncestors` walks UP from attribute-identified
   anchors (container, `[data-barba-sync]`, `[data-nav-reveal]`, `[data-show-except]`,
   `[data-progress-bar]`) — immune to injected siblings, and the pass that matters; then a
   guarded positional walk from the CONTAINER'S PARENT catches attribute-less siblings like
   `top-section-wrapper`.
3. **Injected-node filtering** (`isInjected`). Scripts add nodes that exist only in the
   live DOM, so positional matching must skip them: glass's per-element `.lg-layer`
   overlay (`data-lg-layer`) and its `<svg>` defs holder on body (`data-lg-defs`), the
   tuner fab/panel and the selfie file input (`data-js-injected`).

Hard rules learned the hard way:
- **Never match by class** — classes are exactly what differs.
- **Mark injected nodes with an ATTRIBUTE, never a class** — the sync rewrites classNames,
  so a class cannot protect against the class-rewriter.
- **Never positionally match with `Math.min`.** Counts must be EQUAL or the branch is
  abandoned. A mismatch previously pasted `padding-global`'s class onto a glass overlay,
  producing an empty padded div. Stale classes are a visible nuisance; misaligned ones
  inject padding and hide content.
- `data-barba="wrapper"` is on **`<body>`**, which always holds injected children — never
  anchor a positional walk there.
- **Webflow requirement:** the shell's STRUCTURE must stay identical across pages (same
  nesting, same element order). Only classes may differ. Add a wrapper on one page only
  and that branch silently stops syncing (by design — it fails safe, not wrong).

### text-reveal.js → `window.TextReveal`
Splits `data-text-reveal` elements into words and fades+deblurs them, staggered. On
navigation the reveal is **driven by transition.js** (it primes the words and plays them
at the element's `data-anim` slot so the headline blurs in with the rest of the content).
This module only handles first load itself. Put `data-anim="N"` on a reveal element to
place it in the entrance stagger. Per-element overrides: `data-reveal-blur/-duration/
-stagger/-ease`. API: `refresh(scope)`, `prime(el)`, `play(el)`.

### background-motion.js → `window.BackgroundMotion`
Three composed layers on three DOM levels so they don't fight over `transform`:
`data-drift-field` (a parent that "breathes" on navigation) → `data-orbit` (a wrapper that
circles the viewport) → `data-drift` (blobs that wander in place). Never stack two of these
on one element (the module warns). Runs on elements OUTSIDE the Barba container so it's
created once and never torn down. Respects `prefers-reduced-motion`. API:
`refresh(scope)`, `stop()`, `start()`, `kill(el)`. Knobs documented in the file header.

### orb-motion.js → `window.OrbMotion`
The landing-page orb. Same "one transform per DOM level" discipline as
background-motion, but for elements INSIDE the Barba container, so it re-scans on
`afterEnter` and prunes tweens whose element left the DOM:
`data-orb-path` (outer shell: closed harmonic wander + constant spin) →
`data-orb-squish` (8-value `border-radius` morph + counter-phase `scaleX`/`scaleY`,
endless random-target chains — this is the "squishy bubble") →
`data-orb-float` (inner glows wandering, each with its own phase/clock) +
`data-orb-float-follow` (lag the warping ancestor).

Put the squish on the **shared ancestor** (`orb-wrapper`), not on the glass: one affine
warp there deforms the glass and the glows as a single unit so they can't drift out of
agreement, and a *static* `border-radius: 50%` + `overflow: hidden` on that wrapper is
what guarantees the glows can never escape the boundary. Keep that radius static —
morphing it would clip the glass rim non-affinely.

`data-orb-float-follow` makes an inner layer read as liquid rather than a decal. A child
already inherits the ancestor's transform, so to make it *lag*, the writer sets the ratio
of a smoothed copy of the host's deform to its live one — `inherited * (lagged / live)
== lagged` — cancelling the inheritance and substituting the lagged value. Skews subtract
instead of dividing (they compose additively). Smoothing is exponential and dt-based, so
it feels identical at 60Hz and 120Hz. It also squeezes the wander amplitude along
whichever axis the host is narrowing, so a layer stays proportionally inside rather than
being pushed out and clipped. Runs on `gsap.ticker`; `kill()` removes it.
The radius morph only *shows* where something is painted or clipped, so the squish
element needs a background or `overflow: hidden`. **Never morph a `data-liquid-glass`
node**: glass bakes its displacement map from `offsetWidth`/`offsetHeight` (which
transforms don't change) and a *single* `borderTopLeftRadius`, so a blob or a
non-uniform scale pulls its refraction rim out of register with its painted edge, and
nothing rebuilds because a transform isn't a resize. Per-frame rebuilds aren't
affordable (`buildMap` is a per-pixel JS loop + `toDataURL` — the reason
`freeze()`/`unfreeze()` exist). The line is **affine vs non-affine**: `border-radius` changes the silhouette while the
baked map still describes a circle, whereas `scale`/`skew` transform the element's
finished rendering — rim and map together — so those can't desync from each other.
On a glass node use `data-orb-squish-radius="0"` plus
`data-orb-squish-scale` + `data-orb-squish-skew` (skew is what makes an affine deform
read as a warping blob rather than an ellipse that merely grows), and put the blob morph on
the soft glow layers via `data-orb-float-radius` (which writes `border-radius`, not
`transform`, so it composes with the wander). The module warns if you get this wrong. Never put path/float on a node with
`data-lg-press`/`data-lg-tilt` or `data-anim` — both also write `transform`; use
`data-anim-fade`. Respects `prefers-reduced-motion`. API: `refresh(scope)`, `stop()`,
`start()`, `kill(el)`. Knobs documented in the file header.

### flexicare-core.js → `window.Flexicare` (`FC`)
The persistent brain. Holds:
- `FC.config` — `apiBase` (**STAGING — swap before launch**), `language`, and `selfie`
  capture settings.
- `FC.layout` / `FC.isTablet()` / `FC.isMobile()` / `FC.isDesktop()` — mirrors
  `window.__fcLayout` from the head snippet; has a UA fallback but the head snippet is what
  actually pins the viewport before paint.
- Session id — `getSessionId()`/`setSessionId()`/`clearSession()`, stored in sessionStorage,
  treated as a secret (never logged).
- Buffered selfie — `setPhoto()/getPhoto()/hasPhoto()/clearPhoto()/photoObjectURL()`,
  in-memory Blob.
- `FC.api(path, opts)` — thin `fetch` wrapper; JSON in/out; throws `Error` with `.status`
  and `.detail` on non-2xx.
- `FC.resetJourney()` — wipes per-run state; fires automatically on entering
  `[data-journey-start]`.

### flexicare-onboarding.js
`/onboarding` controller. Attribute contract (all `data-onboarding-*` unless noted):
`-form` (gates init; put on the Form Block/div), `-name` + `-whatsapp` (on the inputs
themselves), `-error` (invalid-number message), `[data-gender="male|female"]` (clickable
divs; selected gets `is-selected` or `data-selected-class`), `-consent` (clickable div;
toggles `is-checked`/`data-checked-class`, optional `data-checked-target`), `-submit`
(disabled via `is-disabled` while invalid but stays clickable to surface errors), `-back`
(URL value → forced destination, else `history.back()`). Values: `-next` (default
`/archetype`), `-busy-label`, `[data-onboarding-label]` inner text node,
`[data-onboarding-form-error]`. Glass can't go on an `<input>` — put it on the field
wrapper and use `data-lg-preset="nav"` (no press/tilt).

### flexicare-selfie.js
Selfie controller. States on `<html data-selfie-state>`: `starting|live|counting|review|
error`. Contract: `[data-selfie-stage]` (circular preview box; JS injects the `<video>`),
`[data-selfie-capture]` (dual-purpose "That's me" → "Next" button), `[data-selfie-retake]`,
`[data-selfie-next]` (URL if the button isn't a link), `[data-selfie-error]`,
`[data-selfie-fallback]` (upload-instead on camera failure), plus embed-provided
`[data-selfie-countdown]` and `[data-selfie-preview]` (`<img>`). Needs `https`; won't work
in the Designer preview — test on a real device on the published/preview URL.

### flexicare-quiz.js
`/archetype` (ROUTING) and later FLEX stages. Config on the `[data-quiz]` wrapper:
`data-quiz-stage="ROUTING|FLEX"`, `-lang`, `-done` (where to go when the stage completes),
`-onboarding` (bounce target if no session id), `-routing` (FLEX fallback), `-accent`,
`-progress-start/-end/-format`. Element hooks: `[data-quiz-prompt]`, `-helper`,
`-progress-label`, `-options` (container), `-option-template` (ONE hidden option cloned per
answer; tag its text `[data-quiz-option-label]`; may carry `data-liquid-glass`),
`-images`/`[data-quiz-image-for="R01"]`, `-next` (disabled until a pick), `-back`,
`-loading`, `-error`. Selected option gets `is-selected` (or `data-selected-class`). This
controller drives the `[data-progress-bar]` width directly as questions advance.

### slider.js → the Liquid Glass Tuner (dev only)
Despite the name, this is a floating control panel for tuning glass parameters live. Gated:
only appears when the URL contains `?tune` (or `localStorage.lgTunerAlways = "1"`). Use it
to dial in a look, save it as a named preset, then run `LiquidGlass.exportPresets()` in the
console and paste the result into `glass.js`'s `PRESETS`. Not shipped behaviour — never
referenced by the funnel. (Its header comment says "v8"; `glass.js` is "v9" — cosmetic
version-string drift, not a real dependency mismatch.)

---

## 4. Conventions every controller follows

- **Init on Barba `afterEnter`**, re-resolving the page by attribute (gates on the page's
  marker element). Idempotent: safe to call twice.
- **One delegated listener per event on `document`**, target re-resolved by attribute at
  event time. Nothing that can go stale is stored. Do not refactor to per-node listeners.
- **Navigate with `barba.go()`**, never `window.location` (a reload drops the in-memory
  selfie). A Webflow placeholder `href="#"` is treated as "no link".
- **Teardown on `beforeLeave` + `pagehide`.**
- **Respect `prefers-reduced-motion`.**
- **Plain ES5 style**: IIFE, `"use strict"`, `var`, no arrow functions / optional chaining /
  template-literal-only assumptions. Keep it consistent with the file you're editing.
- **Mark anything injected into persistent DOM** with `data-js-injected` (or a `data-lg-*`
  marker in glass.js). transition.js's class sync filters on those attributes; an unmarked
  node added to `<body>` or the shell can misalign it. See the transition.js notes above.

---

## 5. External dependencies NOT in this repo

- **The head snippet** (`window.__fcLayout`) — Webflow → Site Settings → Custom Code →
  Head. Pins the viewport/layout mode before first paint. See `docs/webflow-head-snippet.md`.
- **GSAP** and **@barba/core** — loaded from CDN in Webflow before these scripts.
- **The selfie overlay embed** — a Webflow Embed (countdown + preview markup + CSS) placed
  inside `[data-selfie-stage]`.
- **The backend API** at `Flexicare.config.apiBase` (currently staging).
