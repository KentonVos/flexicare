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
- **App** — the funnel itself: `flexicare-core.js` (state) plus four page controllers.

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
flexicare-avatar.js      page controller (avatar picker; needs glass for the card clones)
flexicare-quiz.js        page controller (also needs glass for option styling)
flexicare-reveal.js      page controller (archetype reveal; core only)
slider.js                dev-only tuner; needs glass.js
orb-tuner.js             dev-only tuner; needs orb-motion.js
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
2. **Photo — two mutually exclusive paths.** Whichever the user does LAST wins; the core
   clears one when the other is set. Neither path sends anything: both need a session id,
   which doesn't exist yet.
   - **Selfie** (`flexicare-selfie.js`) — camera capture with a 3-2-1 countdown and
     review/retake. The captured frame is downscaled to a square JPEG **Blob** and buffered
     in memory at `Flexicare.photo`.
   - **Avatar** (`flexicare-avatar.js`) — for users who don't want to be photographed.
     Reached by a plain link from the selfie page. Gender + race pills drive
     `GET /avatars?race=…&gender=…` (always 9 avatars: 3 age groups × 3 variants), rendered
     as a 3×3 grid of clones. The chosen `avatar_id` is buffered at `Flexicare.avatar`, and
     the gender at `Flexicare.avatarGender` (which pre-fills onboarding). **Two endpoints,
     joined on `id`:** the grid *displays* the transparent-background webp renders from
     `GET /avatars/web` (§3.9 — same 90 slots, same ids, same order, a url for every one)
     and *gates selection* on `GET /avatars` (§3.7). A slot is selectable **iff its §3.7
     `url` is present** (api-contract §3.7 — the url is only issued
     once the avatar *and* its two approved scenario images are ready, so `status` is the
     weaker signal and we only log it) — and because `PATCH …/photo/avatar` 409s for an
     unbaked avatar, an unselectable slot still shows its **face** (dimmed) rather than an
     empty placeholder. The `/web` call is best-effort (failure → catalog jpgs;
     `data-avatar-transparent="off"` disables it). Both are re-fetched on every entry and
     filter change because the urls are presigned (~10 min).
3. **Onboarding** (`/onboarding`, `flexicare-onboarding.js`) — collects name, WhatsApp,
   gender, consent, then on submit: (a) `POST /sessions` → stores the session id via
   `Flexicare.setSessionId` (sessionStorage, treated as a secret); (b) sends whichever
   photo is buffered — selfie via presign → PUT → confirm, or avatar via
   `PATCH …/photo/avatar { avatar_id }`. **Only the selfie generates**: the avatar's
   with/without-cover pair is admin-approved and pre-stored, so the `PATCH` just copies it
   onto the session and `/images` is `READY` on the reveal page's first poll (§3.8) —
   `GENERATING`/`FAILED` are selfie-path states. (c) `PATCH …/contact/phone` with the
   E.164 WhatsApp number; (d) navigates to
   `/archetype`. A failed session-create blocks; a failed photo/avatar/phone call does not.
4. **Quiz — ROUTING stage** (`/archetype`, `flexicare-quiz.js`) — `GET /quiz?lang=en`
   once (cached on `Flexicare.quizData`). Renders the 5 routing questions one at a time.
   Each pick is `POST /sessions/{id}/answers` (upsert). After the 5th,
   `POST /routing/preview` returns the archetype (A/B/C) → stored on `Flexicare.archetype`.
   Then navigates to `data-quiz-done`.
5. **Reveal** (`/meet-your-two-selves`, `flexicare-reveal.js`) — the archetype beat, and
   the page that replaced `/loading`. Confirms the archetype (already on
   `Flexicare.archetype`; on a hard reload recovered from `GET /sessions/{id}` +
   `POST /routing/preview`), personalises copy (`FC.firstName`, `archetype_label`,
   `FC.echo`), shows the matching `[data-reveal-for]` copy variants, and **polls**
   `GET /sessions/{id}/images` every ~2.5s for the generated with/without-cover pair.
   The images never block: copy and CTA render immediately, images fade in when ready,
   and `PENDING`/`FAILED`/timeout all fall through to `[data-reveal-images-fallback]`.
   CTA → the FLEX quiz page.
6. **Quiz — FLEX stage** (a later page with `data-quiz-stage="FLEX"`) — same renderer,
   shows only FLEX questions whose `archetype` matches. After the last,
   `POST /sessions/{id}/finish` → `Flexicare.result`.

On a **hard reload** mid-funnel, in-memory state is gone but recoverable: answers are
rebuilt from `GET /sessions/{id}`, and a missing archetype is recovered with a preview.
The one thing that cannot be recovered is the buffered selfie or avatar choice (memory
only) — hence `barba.go()` everywhere.

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
  swapped + cross-faded per page), `data-show-except="landing"` (a comma LIST of
  identities to hide on; page identity is derived from the URL — root = "landing",
  everything else = "page" — unless the incoming container carries
  `data-page-id="<identity>"`, which overrides it and is how a non-root page borrows the
  landing chrome, e.g. the reveal page keeping the nav collapsed),
  `data-nav-reveal` (animate height instead of just opacity),
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

`data-orb-squish-organic` (default **on**) drives scale and skew from one constant-speed
driver as a sum of three sines at harmonic ratios (1, 2, 5 for scale; 1, 3 for skew,
weights summing to 1 so the swing still peaks at the stated amplitude). That gives a slow
swell with faster ripples riding on it — several timescales at once — where the older
stepped mode eased to one random target at a time and so had a single recognisable tempo.
Integer harmonics keep it exactly periodic and therefore seamless, with the driver period
at 3× the base duration. It's also cheaper: one driver tween per element instead of an
endless chain. `data-orb-squish-organic="0"` restores stepped mode.

`data-orb-warp` (opt-in) is the true non-affine route: an SVG `feDisplacementMap` applied
through `filter`, which warps the element's *finished rendering* — refracted backdrop,
rim, specular and edge as one already-composited image. Nothing can desync, for the same
reason skew can't (it happens after the glass has drawn), but it isn't limited to affine,
so it produces concave bulges. Chain shape matters: `feTurbulence` is **static** (animating
`baseFrequency`/`seed` recomputes the whole noise field per frame — by far the most
expensive thing here), an `feColorMatrix` then forces **alpha to 1** — not optional, since
turbulence writes noise into all four channels and filter results are stored premultiplied,
so a noisy alpha scales the R/G that the displacement reads for x/y and you get per-pixel
grain along the rim instead of warping — and an animated `feOffset` scrolls that cached
noise so the bulges travel almost for free. Drift follows the same closed harmonic loop as PATH, so it's
seamless. `data-orb-warp-detail` is that turbulence's `baseFrequency`, in cycles per *pixel*, so it
belongs in the thousandths (~0.002–0.02); the module clamps and warns above 0.08, where the
wavelength is a few pixels and the result is grain that can't form a lobe at any
displacement scale.

Placement has a real consequence: a `filter` makes an element a backdrop root, so putting
the warp on an **ancestor** of the glass leaves the glass nothing behind it to refract. The
module warns about it. **In this project the warp is deliberately on `orb-wrapper`, an
ancestor of `glass-orb`, and the glass refraction is knowingly off as a result** — confirmed
in the browser, not just predicted. That was accepted because the orb is the bottom-most
layer of the page: there is nothing underneath it worth refracting, and warping the wrapper
deforms the glass and both glows together as one shape, which is what the design wanted.
**Do not "fix" this by moving the warp onto `glass-orb`** — it would restore a refraction of
nothing and break the unified silhouette. The alternative placement (on the glass itself,
and/or on a glow group beside it) remains correct for any context where something *is*
behind the orb. The injected `<svg>` defs host is tagged `data-js-injected` so
`syncShellClasses` skips it.

A lava-lamp look is mostly **non-affine** — a bulge swells on one side while the rest
stays put — and affine transforms of a circle are always ellipses, so no scale/skew on the
membrane can bulge it, and nesting more squish layers can't either (affine ∘ affine is
affine). That part has to come from the layers *inside* the membrane, which have no baked
map to respect: `data-orb-float-radius` for true silhouette morph, plus a gooey
`filter: blur(24px) contrast(12)` on a group wrapping the glows so they merge and separate
with a liquid neck. **That group must not be an ancestor of the glass element** — a
`filter` creates a containing block and would break its `backdrop-filter`.

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

### orb-tuner.js → dev-only
Live control panel for orb-motion, gated behind `?orbtune` (or `?tune`, so it can sit
beside the glass tuner — its FAB is offset to avoid overlapping). Sliders for every
`data-orb-*` knob, seeded from whatever the elements already carry so the panel opens
showing the truth rather than defaults. Because orb-motion reads attributes only when it
attaches, each change writes the attribute then `OrbMotion.kill(el)` + `refresh()` — so
motion restarts on every edit (a visible jump mid-drag), in exchange for the panel and a
fresh page load behaving identically. A group's dropdown can also *attach* a behaviour to
an element that has no attribute yet; nothing is ever removed from another element.
"Copy attributes" emits a per-element, paste-ready list with defaults omitted. `init()` is
idempotent — a second evaluation would otherwise stack a second panel and re-seed state
mid-drag. Injected nodes carry `data-js-injected`.

### flexicare-core.js → `window.Flexicare` (`FC`)
The persistent brain. Holds:
- `FC.config` — `apiBase` (**STAGING — swap before launch**), `language`, and `selfie`
  capture settings.
- `FC.layout` / `FC.isTablet()` / `FC.isMobile()` / `FC.isDesktop()` — mirrors
  `window.__fcLayout` from the head snippet; has a UA fallback but the head snippet is what
  actually pins the viewport before paint.
- Session id — `getSessionId()`/`setSessionId()`/`clearSession()`, stored in sessionStorage,
  treated as a secret (never logged).
- Buffered avatar choice — `setAvatar()/getAvatar()/hasAvatar()/clearAvatar()`, plus
  `FC.avatarGender` (kept separately so it survives `clearAvatar()` and can still pre-fill
  onboarding). Shape `{ id, slug, url, race, gender, ageGroup, variant }`; only `id` is
  durable (the url is presigned, ~10 min). **Mutually exclusive with the selfie** —
  `setAvatar()` clears the photo and `setPhoto()` clears the avatar.
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
wrapper and use `data-lg-preset="nav"` (no press/tilt). On submit it fires the photo send
(selfie upload **or** `PATCH …/photo/avatar`) and `PATCH …/contact/phone` in parallel,
both non-blocking. The gender pills are pre-filled from `Flexicare.avatarGender` when the
user came via the avatar picker.

### flexicare-selfie.js
Selfie controller. States on `<html data-selfie-state>`: `starting|live|counting|review|
error`. Contract: `[data-selfie-stage]` (circular preview box; JS injects the `<video>`),
`[data-selfie-capture]` (dual-purpose "That's me" → "Next" button), `[data-selfie-retake]`,
`[data-selfie-next]` (URL if the button isn't a link), `[data-selfie-error]`,
`[data-selfie-fallback]` (upload-instead on camera failure), plus embed-provided
`[data-selfie-countdown]` and `[data-selfie-preview]` (`<img>`). Needs `https`; won't work
in the Designer preview — test on a real device on the published/preview URL.

### flexicare-avatar.js
The avatar picker — the alternative to the selfie, and a sibling page, not a step after
it. Wrapper `[data-avatar]` (may BE the container). Config on the wrapper uses `-url` /
`-default` suffixes **on purpose**, so the wrapper is never matched by the pill/button
queries: `data-avatar-next-url` (default `/onboarding`), `-back-url`, `-gender-default`
(`male`), `-race-default` (`black`), `-debug`. Filters: `[data-avatar-gender="male|female"]`
and `[data-avatar-race="black|white|indian|asian|coloured"]` — **the value is the API enum,
not the label**, so the design's "Mixed" pill is `data-avatar-race="coloured"`. The pills
may be a Tabs component's tab-links, but **nothing may depend on Webflow's Tabs JS**: it
binds once on `DOMContentLoaded`, so after a Barba swap panes stop switching and
`w--current` stops moving. Style the selected state on `is-selected` (toggled here) and
keep the two filter rows as siblings rather than nested Tabs. Grid: `[data-avatar-grid]`, built one of two
ways — **static** (the normal path): nine authored `[data-avatar-slot="1".."9"]` cards,
numbered in reading order because the API's 9 always come back young_adult 1-3,
middle_aged 1-3, elder 1-3; they are filled in place and never removed, so the author's
layout/classes/glass survive. **Clone**: one `[data-avatar-option-template]`, used only
when no slot cards exist. Either way each card carries `data-avatar-option`, `-id`,
`-slug`, `data-age-group`, `data-variant`, and its `[data-avatar-image]` (or the card
itself, as a background) is painted after decode with `is-loaded`. Selected → `is-selected`/`data-selected-class` + `aria-pressed`; a slot with
no approved image → `data-avatar-unavailable` + `is-unavailable` + `aria-disabled`, not
clickable — but it does show its face, from the transparent `/avatars/web` render the grid
displays (`display_url`); the gate is the §3.7 `url`, not `status`, and not what's on
screen. `data-avatar-transparent="off"` falls back to catalog jpgs. States: `[data-avatar-loading]`,
`-empty`, `-error`, mirrored on the wrapper as
`data-avatar-state="loading|ready|empty|error"`. Buttons `[data-avatar-next]` (disabled-look
until a pick, still clickable to surface the message) and `[data-avatar-back]`.
**Loading skeleton** (all CSS-driven, no new elements — paste-ready CSS in
`docs/avatar-loading-state.md`): a `beforeEnter` hook calls `prime()` on the *incoming*
container, so `data-avatar-state="loading"` is on before the page is visible — `init()`
can't do it, it runs on `afterEnter`. `prime()` is deliberately scope-limited (no
`document` fallback) so it no-ops when navigating anywhere else. Per card,
`data-avatar-card-state="loading|ready|unavailable"` + class `is-loading`
(`data-loading-class` to rename) + `aria-busy`; a card stays `loading` until *its own*
image has decoded (`paintImage` now takes a done callback, also fired on decode error so
a card can't shimmer forever), then flips to `ready`. Filter pills and Next/Back get the
same class while the fetch is in flight; pills stay clickable. The wrapper attribute
should ALSO be set statically in the Designer — on a hard load the footer scripts run
after first paint, which is the placeholder flash this whole thing exists to kill.
**The shimmer stylesheet is injected by the script** (`injectCSS()`, once, flagged
`data-js-injected`), for the same reason transition.js injects its FOUC rule: Barba never
swaps the `<head>`, so CSS in a *page's* Custom Code is present on a hard load and gone on
every `barba.go()` arrival — which is exactly the "animation only works after a reload"
bug. The injected selectors are `:where()`-wrapped (zero specificity) and the colours/speed
are custom properties on `[data-avatar]`, so anything authored in the **site** head
overrides without `!important`; `data-avatar-skeleton="off"` on the wrapper skips the
inject altogether.
Filter changes are debounced 180 ms; a run token invalidates in-flight fetches and image
decodes on teardown. **It never calls the API with the session** — the choice is buffered
and onboarding sends it.

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
**Per-question Next label**: put `[data-quiz-next-label]` on the text element inside the
next button and the wrapper's `data-quiz-next-text-last` (default: `data-quiz-next-text`,
which itself defaults to whatever text the button already carries) is swapped in on the
FINAL question — that's how the routing quiz ends on "See your 2 selves". Set in
`applyState()`, so it's right on first paint, on every advance, and reverts on Back.
Without the label attribute the button text is never touched.
**Loading skeleton** (`docs/quiz-loading-state.md`): nothing can paint until `GET /quiz`
lands, and the authored `[data-quiz-option-template]` card was visible in that gap. A
`beforeEnter` hook calls `prime()` on the incoming container — before it is visible — which
hides the template, stamps `data-quiz-state="loading"` and appends N (`data-quiz-skeleton-count`,
default 4) **inert** clones marked `[data-quiz-skeleton-option]`: no `data-quiz-option` (the
delegated handler can't see them), `aria-hidden`, labels blanked, entrance attributes
stripped, children `visibility:hidden`. `showLoading()` mirrors all of it for the hard-load
path, `buildOptions()` and `teardown()` clear it. The prompt/helper shimmer as bars (text
transparent) and Next/Back dim. Like the avatar picker, **the stylesheet is injected by the
script** (`injectCSS()`, `data-js-injected`) because Barba never swaps the `<head>` —
page-level head CSS is the "only works after a reload" trap. `:where()`-wrapped selectors +
`--fc-quiz-skeleton-*` custom properties on `[data-quiz]` make site-head overrides win
without `!important`; `data-quiz-skeleton="off"` skips the inject.

### flexicare-reveal.js
`/meet-your-two-selves` — the archetype reveal between ROUTING and FLEX. Config on the
`[data-reveal]` wrapper: `data-reveal-next` (CTA target: the FLEX page), `-onboarding`
(bounce if no session id), `-routing` (bounce if the archetype can't be recovered),
`-lang`, `-poll` (ms, default 2500, min 1000), `-timeout` (ms, default 90000), `-debug`.
Copy slots: `[data-reveal-name]` (+ `[data-reveal-name-wrap]`, hidden when there's no
name), `-archetype-label`, `-echo`.

**The copy database.** Per-archetype card copy is NOT six duplicated cards — it's one
hidden Webflow Embed marked `[data-reveal-copy]` containing `[data-copy-for="A|B|C|*"]`
blocks of `[data-copy="<slot>"]` elements (a `<script type="application/json"
data-reveal-copy>` block is accepted as an alternative). The slot name *is* the target's
Webflow ID — `data-copy="with-cover-heading"` writes into `#with-cover-heading`
(`[data-reveal-slot="…"]` also works). The design's four slots are
`with-cover-heading` / `without-cover-heading` / `with-cover-text` /
`without-cover-text`. Copy is inserted as HTML, so inline markup survives. An
archetype's slot **replaces** the `*`/`default` one rather than merging. Repeating a
slot name gives it several items and the target cycles through them — all cycling slots
share ONE interval (`data-reveal-cycle`, default 4000ms, min 1200) so the two cards
change in step, with a `data-reveal-cycle-fade` crossfade (GSAP; hard cut under reduced
motion or with GSAP absent). Invalid JSON warns and leaves the Webflow copy untouched.
`Flexicare.reveal.copy("A")` dumps what the database resolves to.

**Shipping the slots hidden (`is-0`).** No script can beat the first paint, so the page
may paint the Designer's placeholder before a footer script runs. The fix lives in
Webflow: give each copy slot a combo class (`is-0`, `opacity: 0`) — Webflow's stylesheet
is in the `<head>`, so it applies at first paint — and `clearCopySkeleton()` strips that
class from the whole `[data-reveal]` subtree once the copy is in, including on the error
path (an unresolvable archetype must fall back to the Designer's copy, not to an invisible
card). Rename via `data-reveal-hide-class` on `[data-reveal]`, empty to disable. Note that
`opacity: 0` also hides that element's shimmer bar, so a shimmer *and* invisible copy means
`is-0` on the text and `data-reveal-skeleton-target` on its wrapper.

**Targets are resolved inside the incoming wrapper, never with
`document.getElementById()`.** During a Barba swap the document briefly holds BOTH
containers, and `getElementById()` returns whichever comes first in DOCUMENT ORDER — so it
can hand back the OUTGOING one. Measured 2026-08-24: a full page of correct copy went into
the dying container, the cycler then updated orphaned nodes for the rest of the visit, and
the cards kept the Designer's placeholder — which looks exactly like "the copy never
loaded", and comes right after a refresh (one container, no ambiguity). `copyTargets()`
therefore searches `state.wrap` → its container → the document, keeping only **attached**
nodes, and writes EVERY match rather than the first. The cycler prunes detached nodes on
each tick, the same way `orb-motion.js` prunes tweens for removed elements. This is the
same trap as transition.js's "never match elements by class across containers" rule: on
this page the containers are structurally identical, so any document-wide lookup is a
coin toss.

**The database is read from the live DOM, or failing that from the incoming page's HTML.**
The embed belongs INSIDE `data-barba="container"` — Barba swaps nothing else, so an embed
parked in the shell (or at body level) is simply absent on every `barba.go()` arrival and
the cards keep the Designer's placeholder copy, which looks like real copy and comes right
after a hard refresh. `copySources()` therefore falls back to parsing `data.next.html`
(stashed in the `beforeEnter` hook) with `DOMParser` — the same trick `syncShellClasses()`
uses — and warns, naming the structural problem. Note the asymmetry: **sources** may be a
detached document, **targets** (`copyTargets()`) are always live DOM, since the ID'd slots
live inside the container and do get swapped.

Structural variants: `[data-reveal-for="A"]` (comma-separated list allowed) still hides
non-matching blocks, for differences the copy database can't express; the wrapper also
gets `data-archetype` for CSS-only variants. Images: `[data-reveal-image="with|without"]` (an `<img>` gets
`src`, anything else gets `background-image`; both get `is-loaded` after decode),
`-images-loading`, `-images-fallback`, and `data-reveal-state="loading|ready|fallback"`
on the wrapper. Buttons: `-next`, `-back`. **The image poll is fire-and-forget** — it runs
in parallel with the archetype resolution and can never block or break the page; presigned
image URLs expire after 10 minutes, so they're read fresh from the poll and never stored.
Async work is guarded by a run token that teardown bumps, so a fast navigation can't write
into the next page's DOM.

**Loading skeleton** (`docs/reveal-loading-state.md`): the page paints the Designer's
placeholder copy immediately and the real copy only lands once the archetype is known —
a microtask coming from the quiz, but `GET /sessions/{id}` → `GET /quiz` →
`POST /routing/preview` on a hard reload. A `beforeEnter` hook calls `markSkeleton()` on
the incoming container — before it is visible — which hides the `[data-reveal-copy]`
embed, stamps `data-reveal-copy-state="loading"` and puts `data-reveal-skeleton` on every
slot the database will write into (derived from the database, not hard-coded:
`allSlotNames()` reads every `data-copy` for *all* archetypes, since the archetype isn't
known yet) plus `[data-reveal-name]` / `-archetype-label` / `-echo`. Each image's frame
(`[data-reveal-image-frame]`, else `parentNode`) gets `data-reveal-skeleton-frame`, keyed
to the separate `data-reveal-state` clock — copy and images clear independently. The copy
skeleton clears **after** the paints, never before, so the transparent text is revealed
already correct rather than flashing the placeholder; the failure branch and `teardown()`
clear it too, so it can't get stuck. Per-element escapes: `data-reveal-no-skeleton`,
`data-reveal-skeleton-target`. Like the quiz and avatar pages, **the stylesheet is
injected by the script** (`injectCSS()`, `data-js-injected`) because Barba never swaps the
`<head>`; `:where()`-wrapped selectors + `--fc-reveal-skeleton-*` properties on
`[data-reveal]` make site-head overrides win without `!important`;
`data-reveal-skeleton="off"` skips the inject.

The page's container also carries `data-page-id="landing"` (see transition.js) so the nav
stays collapsed here exactly as it does on the landing page — which means **the CTA must
live inside the container**, not in the synced nav region, or it would be hidden with the
nav.

**The canonical shell structure.** Every page must ship this tree. Only the CLASS names
may differ per page (`landing-glass-container` vs `glass-container`, `scroll-wrapper` vs
`responsive-wrapper` — that's exactly what the class sync is for). The nesting depth,
element order and TAG NAMES may not:

```
body
  page-wrapper
    main-wrapper                       <main>
      content-wrapper
        <glass container>
          glass-background-container
            padding-global
              container-large
                <scroll wrapper>
                  top-section-wrapper          (the logo + progress bar)
                  glass-content-wrapper        data-barba="container"
        button-navigation-wrapper       data-barba-sync="nav", data-nav-reveal,
          button-navigation-glass-wrapper      data-show-except="landing"
      background-gradients
```

Measured 2026-08-21: the reveal page had ONE EXTRA level (`content-flex-wrapper` between
`container-large` and `scroll-wrapper`, with `top-section-wrapper` inside it rather than
beside the container). One extra level is enough to break everything, because
`syncAncestors()` walks both chains in lockstep and only checks tagName: off by one, every
class lands one level from where it belongs, and the container came out 684px instead of
789px on arrival while looking correct after a refresh. Symptoms cascade — it also produced
a bogus `live is <main>, next has <div>` warning from comparing `<main>` against
`content-wrapper`. **Anything page-specific must live INSIDE the container**, too: the
reveal page's `[data-reveal-copy]` embed was parked at body level, so Barba never brought
it across and the cards silently kept the Designer's placeholder copy.

**Layout debug panel** (dev only, at the bottom of `transition.js`): gated behind
`?fcdebug` — which **sticks in `localStorage`**, because the bugs it exists for span a
navigation and `barba.go()` drops the query string; `?fcdebug=off` clears it. Live
readout of the four numbers that separate the otherwise-identical "wrong on arrival,
right after a refresh" causes: what `pageIdentity()` resolved **and from where**
(URL vs a `data-page-id` override — a missing override is why a nav would be shown on a
page that means to hide it), the nav's should-hide vs actually-hidden plus its live
height (and it outlines the nav wrapper), document overflow beyond the viewport **with a
peak**, so a transient spike mid-transition is still visible after it's gone, and any
branch the shell class sync abandoned. Click the panel to reset the peak before a
navigation. `PageTransition.shellSnapshot()` is the console-side equivalent for shell
classes alone.

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
- **The backend API** at `Flexicare.config.apiBase` (currently staging). Full endpoint
  contract: `docs/api-contract.md`.
