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
flexicare-kiosk.js       MUST precede onboarding — it owns the device token that
                         POST /sessions needs. Inert on the public site.
flexicare-onboarding.js  page controller
flexicare-selfie.js      page controller
flexicare-avatar.js      page controller (avatar picker; needs glass for the card clones)
flexicare-quiz.js        page controller (also needs glass for option styling)
flexicare-reveal.js      page controller (archetype reveal; core only)
flexicare-product.js     page controller (the recommendation; core only)
flexicare-spin.js        page controller (the prize wheel; needs core + kiosk + GSAP)
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
   CTA → the FLEX quiz page (`data-reveal-next`, default `/flexicare`).
6. **Quiz — FLEX stage** (`/flexicare`, `data-quiz-stage="FLEX"`) — the SAME controller
   and the same Webflow page duplicated from `/archetype`; only the `[data-quiz]` config
   attributes differ. Shows only FLEX questions whose `archetype` matches
   `Flexicare.archetype` (recovered with a preview if the page was hard-loaded, or a
   bounce to `data-quiz-routing` if the routing answers aren't all there). `GET /quiz` is
   not re-fetched — `FC.quizData` is still warm. After the last,
   `POST /sessions/{id}/finish` → `Flexicare.result` → `data-quiz-done`
   (`/flexicare-product`).
7. **Product** (`/flexicare-product`, `flexicare-product.js`) — the recommendation. Renders
   the plan the server picked, straight out of `Flexicare.result`: `product` (`CORE`/`PLUS`),
   `product_label`, `archetype_label` and `recommended_price_cents`. Nothing to wait for —
   every value is resolved server-side, so on a `barba.go()` arrival the page paints in the
   same frame. CTA → the spin-to-win page (`data-product-next`), or straight past it
   on an unpaired device if `data-product-next-web` is set.
8. **Spin to win** (`/spin-to-win`, `flexicare-spin.js`) — **KIOSK ONLY**, and the only
   page in the funnel that is. `GET /sessions/{id}` answers everything at once (is it
   `COMPLETED`, is the channel `KIOSK`, is there a `phone_number`, has it already spun,
   which store), then `GET /prizes/wheel` supplies the segments and `POST /spin` decides
   the outcome. A `WEB` session is detected up front and shown the unavailable panel
   rather than being allowed to tap a wheel that would 409.

   The kiosk half of this starts much earlier: `flexicare-kiosk.js` holds the device
   token and `onboarding` sends it on `POST /sessions`, which is what makes the session
   `channel: "KIOSK"`. Break that chain and the shopper is refused at the wheel after
   completing the whole journey.

On a **hard reload** mid-funnel, in-memory state is gone but recoverable: answers are
rebuilt from `GET /sessions/{id}`, and a missing archetype is recovered with a preview.
The one thing that cannot be recovered is the buffered selfie or avatar choice (memory
only) — hence `barba.go()` everywhere.

---

## 3. Module reference

### glass.js → `window.LiquidGlass`
Attribute-driven liquid-glass effect. Hook: `data-liquid-glass`. Optional preset
`data-lg-preset="cta|nav|panel|pill"` (those four are the ONLY built-ins — see the
preset warning below) and many `data-lg-*` knobs (refraction, lighting,
surface, interaction) — see the header comment in the file for the full list and defaults.
- Refraction (the real distortion) is **Chrome/Edge only**; Safari/Firefox get a plain
  backdrop blur instead. Lighting, surface and press work everywhere.
- **`data-lg-blur` is a real px radius, applied as a native `blur()` in front of the
  displacement `url()`** — `backdrop-filter: blur(8px) url(#lg-3)`. It is deliberately
  NOT an `feGaussianBlur` in the SVG chain: that filter's region is pinned to the
  element box, so a blur there samples transparent past the edge and eats its own rim,
  which is why the knob used to look inert at every value. Because blur no longer feeds
  the displacement map it is not in `REFRACT_KEYS`, so changing it re-applies the
  backdrop-filter string without rebuilding the map.
- **The light angle sweeps.** `lightPhase` rotates 0 → 360 on an 8-second loop and is
  added to every host's `data-lg-lightangle`, so the page reads as ONE light source
  travelling across it rather than each element holding its own fixed angle — any
  authored offset between two pieces of glass survives. Cheap: `lightangle` only feeds
  `applyChrome` (a box-shadow string), so the sweep never touches the displacement map
  or the backdrop-filter. It is still a box-shadow repaint per host per frame, so it is
  the first thing to turn down on a page carrying dozens of glass elements. Skipped
  entirely under `prefers-reduced-motion`. Opt out per element with
  `data-lg-lightspin="0"`, or globally with `LiquidGlass.lightSpin(0)` — which is what
  the tuner does on open, since otherwise the dial fights the animation for the same
  property.
- **There is no chromatic aberration knob.** `data-lg-ca` was removed on 2026-08-31.
  The filter used to split R/G/B into three displacement passes at different scales and
  recomposite them; it is now a single pass, and the `feColorMatrix`/`feComposite`
  helpers the split needed are gone with it.
- **There is no saturation and no tint knob.** `data-lg-saturate`, `data-lg-tinthue`
  and `data-lg-tintamount` were removed on 2026-08-31 — glass takes the colour of what
  is behind it. `frost` (milky white overlay) and `glow` (inner caustic band) are what
  remain on the surface layer.
- **There is no press tilt and no elevation knob.** `data-lg-tilt` and
  `data-lg-elevation` were removed on 2026-08-31. Press is now a straight `scale()` —
  it no longer rotates toward the tap under a `perspective()`, so the spring does not
  read the pointer position at all.
- **Glass casts NO drop shadow.** Every box-shadow layer `applyChrome` writes is
  `inset` (rim + specular); the two outer cast layers that `elevation` scaled are gone.
  If a glass element needs to lift off the page, put the shadow on a **wrapper** in
  Webflow — box-shadow on the host itself is rebuilt from scratch on every refresh and
  will be wiped.
- `press` animates the element's `transform`. Don't combine with a Webflow transform
  interaction on the same node (set `data-lg-press="0"` if you must).
- API: `scan()` (attach to any new `[data-liquid-glass]`), `refresh(el)`, `refreshAll()`,
  `lightSpin(seconds)` (0 = stop the sweep and restore authored angles),
  `freeze()`/`unfreeze(rebuild)` (pause displacement-map rebuilds during a size animation),
  `reloadPresets()`, `exportPresets()`, `presets`.
- Presets saved by the tuner live in `localStorage` under `lgTunerPresets` and merge on
  top of the built-in `PRESETS`. `exportPresets()` prints them ready to paste into the
  `PRESETS` object so they become permanent.
- **⚠️ A tuner preset is invisible to every other device until you paste it in.** The
  built-ins are only `cta`, `nav`, `panel`, `pill`; the Designer currently also uses
  `background-glass`, `tag`, `button-glass`, `character-card` and `nav-container`, none
  of which are in the file. On any browser without the matching `localStorage`, those
  hosts silently take `DEFAULTS` — so the glass looks right on the machine that tuned it
  and wrong on the kiosk tablets. `readOpts` warns once per unknown name (added
  2026-09-02); before that it failed with no signal at all. See `docs/webflow-mcp.md` §9.


**Positioning.** A glass host must CONTAIN the injected `.lg-layer`
(`position:absolute; inset:0`), so it needs a non-static position — but `absolute`,
`fixed`, `sticky` and `relative` all satisfy that. glass.js therefore reads the
author's computed position at `attach()` and only steps in when it is `static`,
marking it `data-lg-static` (the stylesheet scopes `position:relative` to that
marker). **It used to force `relative` on every host**, which silently broke any
element the author had positioned: the stylesheet is appended at script-execution
time and these scripts load in Webflow's FOOTER, so it landed after the site CSS and
won at equal specificity (`[data-liquid-glass]` and `.some-class` are both 0,1,0). An
absolutely-positioned card snapped into normal flow the moment glass was added, with
nothing in the console. It has to be a marker rather than a blanket rule — a blanket
rule would already have made every host relative by the time we looked, so the
author's intent would be unreadable.
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
  `data-nav-reveal` (animate height instead of just opacity — it must be on the SAME
  element as `data-show-except`, or `applyVisibility` falls back to the opacity mode
  and the space is never returned; note it collapses `height`, `min-height` and
  vertical `padding`, so any OTHER box property that keeps the wrapper tall — a
  `margin`, a `border` — would need adding there too),
  `data-progress-bar` + `data-progress="0..1"` per container.
- Tunables in `window.PageTransition.config`.
- `window.PageTransition.nav.hide(instant)` / `.show(instant)` / `.isHidden()` — the same
  collapse the landing page uses, callable MID-page. `/spin-to-win` hides the nav the
  moment the wheel starts turning (the spin CTA lives in there, and the next step is going
  home, where it is collapsed anyway). It runs the real `navReveal()`, so `__navHidden`
  stays truthful and the next navigation agrees about where the nav already is — a
  hand-rolled height tween would leave `applyVisibility` collapsing or reopening it a
  second time. Needs `[data-nav-reveal]` on the wrapper. Note the collapse RETURNS ITS
  SPACE to the layout, so a `flex:1` sibling (the spin stage) grows into it.

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
`data-lg-press` or `data-anim` — both also write `transform`; use
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
- `FC.api(path, opts)` — thin `fetch` wrapper; JSON in/out; throws `Error` with `.status`,
  `.detail` and `.retryAfter` (seconds, from the `Retry-After` header on a 429) on non-2xx.
  `opts.kiosk === true` attaches `X-Kiosk-Token` when the device is paired — opt-in per
  call, because the header belongs on exactly two funnel calls.
- `FC.config.kiosk` — fallback kiosk settings (`tokenKey`, `attractUrl`,
  `heartbeatSeconds`, `idleTimeoutSeconds`, `appVersion`). The server's per-device config
  overrides all of them once paired.
- `FC.resetJourney()` — wipes per-run state (session id, selfie/avatar, answers,
  archetype, echo, result, images, `FC.award`, `FC.lead`, `FC.contact`, and the
  `flx_spin_lead_*` sessionStorage keys). Fires automatically on entering
  `[data-journey-start]`.
  - **`[data-journey-start]` MUST be inside `data-barba="container"`.** On a navigation
    the check is scoped to the incoming container, so an attribute on `<body>` or
    anywhere else in the persistent shell is an ancestor and can never be found — the
    reset then fires on a hard load but NOT when the user navigates in, which is the
    "start over" path and the only one that matters. It sat on `<body>` until
    2026-08-31. `maybeResetJourney` now warns when it finds it stranded outside.
  - Two things it deliberately does NOT clear: the **kiosk device token**
    (`localStorage flx_kiosk_token` — a device credential; wiping it strands a paired
    tablet mid-shift) and the **`?demo` flag** (`sessionStorage fcSpinDemo` — armed once,
    meant to survive arriving back at the landing page for another lap). Hence the
    prefix-scoped sweep rather than `sessionStorage.clear()`.

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
wrapper and use `data-lg-preset="nav"` (no press). On submit it fires the photo send
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
`/archetype` (ROUTING) and `/flexicare` (FLEX). One controller, two pages: `/flexicare`
is a Webflow duplicate of `/archetype` — identical structure and element hooks, different
`[data-quiz]` config. Config on the `[data-quiz]` wrapper:
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
`[data-reveal]` wrapper: `data-reveal-next` (CTA target: the FLEX page, default
`/flexicare`), `-onboarding`
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

**The name resolves independently of the archetype.** `FC.firstName` is memory-only, so a
hard reload anywhere earlier in the funnel loses it while the session id survives. The
recovery used to be a side effect of `ensureArchetype()`'s `GET /sessions/{id}` — which is
skipped entirely when the quiz has just set the archetype, so on a `barba.go()` arrival the
greeting stayed hidden (`[data-reveal-name-wrap]` is hidden when there is no name) and came
back only after a refresh. `init()` now fires its own recovery when `FC.firstName` is
empty; both paths share one cached `fetchSession()` so there is never a second request.

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

**No controller may resolve its own elements document-wide.** Both containers are in the
DOM during a swap and they are structurally identical, so `document.getElementById` /
`document.querySelector` is a coin toss between the incoming and the OUTGOING page. Two
2026-08-24 bugs came from it: the reveal copy written into the dying container, and
`resolveWrap()`'s document fallback letting the QUIZ controller initialise on the reveal
page, conclude the stage was complete and fire a second `barba.go()` — so the destination
ran its entrance animation, init, skeleton and copy paint twice. The fallback is now
restricted to the hard-load path (`scope === document`); an incoming container that lacks
the page's wrapper means "not this page". Each `go()` also refuses to navigate to the path
it is already on.

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
                                          data-show-except="landing"
          button-navigation-glass-wrapper      (the glass host)
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

The panel also carries an **ENTERS** row: one line per page entry (`once`/`enter`, path,
timestamp), red and flagged when the same path is entered twice in a row. A double entry
re-runs the entrance animation, the controller's `init()`, the skeleton pass and the copy
paint, so it presents as several unrelated glitches — that row is how the 2026-08-24
double-entrance bug was found. The duplicate-entry `console.warn` is **not** gated behind
`?fcdebug`: whoever is staring at the glitches should see the cause in the same console.

**Reveal copy tracer** (`flexicare-reveal.js`, same `?fcdebug` flag): on every copy paint it
logs where the database was read from (live DOM vs incoming HTML), how many containers are
in the DOM, and per slot how many `#id`/`[data-reveal-slot]` matches exist, which element
was written, whether it is attached, what makes it `display:none`, and the resulting text.
1.5s later one AUDIT line per slot says whether the element written is still the element on
screen — the question that separates "the copy never arrived" from "the copy went into a
container that was then removed".

### flexicare-product.js
`/flexicare-product` — the last beat of the WEB funnel: the plan the server recommended.
Config on the `[data-product]` wrapper: `data-product-next` (CTA → spin-to-win; **set it**,
the `/spin-to-win` fallback warns in the console), `-next-web` (used *instead* when the
device is not a paired kiosk — the wheel is kiosk-only, so this is how web visitors skip
`/spin-to-win`; unset, everyone goes to `-next`), `-onboarding` (bounce if no session id),
`-quiz` (bounce if the session isn't `COMPLETED`, default `/flexicare`), `-lang`,
`-price-format` / `-price-decimals`, `-cycle` / `-cycle-fade`, `-debug`, `-skeleton="off"`.

**Where the data comes from.** One object: `Flexicare.result`, the
`POST /sessions/{id}/finish` response the FLEX quiz stashed before navigating. On a hard
reload / deep link it is re-read from `GET /sessions/{id}`, which carries the same fields
once the session is `COMPLETED`; a session *without* a product means the FLEX stage isn't
finished, so we bounce to `data-product-quiz` rather than render an empty plan. There is no
polling and no generation step — unlike the reveal page, nothing here is asynchronous
except that recovery.

**The copy database is keyed on TWO axes.** The reveal page keys on the archetype alone;
plan copy differs per archetype *and* per product, which is six variants of every card.
So `data-copy-for` takes `ARCHETYPE:PRODUCT` — `"A:PLUS"` — and either half may be `*`. A
bare token is read from its own vocabulary (`A`/`B`/`C` are archetypes, `CORE`/`PLUS` are
products), so `"A"` means `"A:*"` and `"PLUS"` means `"*:PLUS"`. Commas separate
alternatives. **More specific wins, slot by slot**, replacing rather than merging, on the
ladder `*` → product → archetype → pair; a typo'd token matches nothing (it is never
silently treated as a wildcard). Everything else mirrors the reveal database: slot name =
target's Webflow ID (or `[data-product-slot]`), the embed must live INSIDE
`data-barba="container"` (else it is recovered from the incoming page's HTML and warns),
JSON blocks accepted, copy inserted as HTML.

**Repeated slots always end up on screen TOGETHER.** How, depends on what the page offers
for that slot, in order: a `[data-product-list]` container → the items are cloned from ONE
authored `[data-product-list-template]` inside it; several elements with the ID → one item
each in order; ONE element → that element is cloned in place, once per item, as siblings
after itself, so the plain build needs no wrapper at all. Mark a `[data-product-row]`
ancestor when the ID sits on the text and the arrow glyph is a sibling — that ancestor is
then what gets cloned. The ID stays on the original only; duplicate IDs are invalid and
would push the next paint down the one-item-per-element branch. This is what copes with a
list whose length changes per combination (C:PLUS has five lines where A has four).

**Cycling is opt-in**, via `data-product-cycle-slot` on the element. It was briefly the
default for multi-item slots, which animated the benefit lines one at a time — right for a
rotating strapline, wrong for a set of benefits.

Clones (both paths) are rebuilt on every paint, glass re-scanned, and run through
`unhide()` — the same idiom as the quiz's option template. **`unhide()` sweeps the root AND
every descendant**, because TWO rules hide authored content until its entrance animation
runs (`.lg-anim [data-anim]{opacity:0}` in transition.js, `.tr-ready [data-text-reveal]
{visibility:hidden}` in text-reveal.js) and clones inherit both while being built *after*
those animations have already run — so nothing will ever come along and reveal them. Root-
only stripping is not enough: the attribute usually sits on the TEXT element inside the row,
which is how cloned rows once rendered with their check icons and no words (2026-08-25).
text-reveal's inline `visibility` is cleared per element too, but only on the elements in
that sweep — a blanket un-hide would also reveal whatever the template hides on purpose.
`[data-product-list-text]` inside a template is its text slot, so the item's arrow glyph
(or check icon) survives — anything else in the template is cloned untouched, which is how
every row gets its own icon.

**Clones are born mid-animation, so `unhide()` clears inline motion too.** transition.js
animates `[data-anim]` in from an offset — gsap writes `transform: translate(0,Npx)` and
`opacity:0` inline, then clears both when the tween ends. Clones are built during
`afterEnter`, WHILE that tween is running, so they inherit a mid-flight transform, and the
tween that would clear it is pointed at the template (by then detached). Nothing ever
clears the clones. The symptom is deceptive: `check-wrapper` has no `data-anim` so it stays
put while the text inside the same row is pushed down about one row's height, which reads
as "the text is shifted one row down, the first row has no text and the last has no check"
— every row is in fact correct and only the text is displaced (2026-08-25). So
`clearInlineMotion()` wipes inline `transform`/`opacity`/`filter`/`visibility` across the
whole subtree, on the pristine template at capture time AND on every clone. Inline only, so
anything authored through a Webflow class survives. `debugList()` prints a `dy` per row for
exactly this — it should be ~0.

**The authored template is DETACHED, not hidden.** `resolveList()` keeps a pristine
`cloneNode(true)` in `state.lists[slot]` and removes the original from the DOM the first
time it sees it; every paint clones from that detached copy. Hiding it was tried twice and
failed twice — an inline `display:none` loses to a Webflow class carrying `!important`, and
an attribute rule of our own gets inherited by the clones (they are made FROM the template)
and hides the whole list. A detached node cannot render whatever any stylesheet says. The
symptom when the template DOES render is worth recognising: one empty row above the real
ones, which reads as "the text is shifted down by one" (2026-08-25). The same removal is
applied in `clearSkeleton()` to a list whose slot got no copy at all.

**The list attributes are swap-prone.** The contract is container OUTSIDE
(`data-product-list`), template INSIDE (`data-product-list-template`), and reversing them
fails in a way that looks unrelated: the template becomes an ANCESTOR of the container, the
"is there a template in here?" lookup finds nothing, the slot falls through to the ID path,
and you get the text cloned as siblings *inside* the row — laid out along the row's flex
axis, with no icon on any clone. `resolveList()` therefore detects the inversion (and the
both-attributes-on-one-element case), renders it the intended way round, and warns with
what to change. Clones are stripped of BOTH attributes, or the next paint's resolve would
find a clone instead of the real container.

**Tokens** are substituted into every slot as it's painted: `{name}`, `{price}`,
`{amount}`, `{product}` (`product_label`), `{archetype}`, `{echo}`. That lets the embed
carry `"Your Flex, {name}."` as one sentence rather than splitting it around a
`[data-product-name]` span. A token resolving to NOTHING also eats one comma-or-space run
before it, so a missing name degrades to `"Your Flex."` rather than `"Your Flex, ."`; an
unknown token is left visible so typos surface.

**The authored copy lives in `docs/product-copy-embed.html`** — paste-ready, one block per
archetype x product plus a `*` fallback. It holds only the TWO slots that vary on both
axes: `plan-heading` and `plan-benefit`. Everything else on the page comes from somewhere
cheaper — `[data-product-label]`/`[data-product-price]` from the API, `"Your Flex, [Name]."`
as static text plus `[data-product-name]`, and the per-archetype framing line
(`"Based on your family —"`) as three static Webflow variants gated by
`[data-product-for="A|B|C"]`, since it is not in the API and does not vary by product.
The archetype-C Core block is a flagged placeholder: C10 designs PLUS only, but the API can
still return `CORE` for C because `product` comes from `tier_score`.

`[data-product-for="A:PLUS"]` hides/shows whole structural blocks on the same keys.
API-driven slots (written from the result, not the embed): `[data-product-name]`
(+ `-name-wrap`, hidden when there's no name), `-echo`, `-archetype-label`, `-label`
(`product_label`), `-code` (the raw `CORE`/`PLUS`), `-price`. **The price is in CENTS** and
may be `null` — `formatPrice()` divides by 100, applies `data-product-price-format`
(`"From R{amount}/month"`, overridable per element) and thin-space thousands separators
without `Intl`; a null price hides `[data-product-price]` and `[data-product-price-wrap]`
instead of printing `R0`.

**Skeleton**: same approach as the reveal page and for the same reason — script-injected
CSS (`data-js-injected`), marked on `beforeEnter` before the page is visible, cleared only
*after* the paints so the real text is revealed already correct. Normally invisible, since
the result is usually already in memory; it exists for the hard-reload path.

### flexicare-kiosk.js → `window.Flexicare.kiosk`
Device pairing, heartbeat, idle reset and fullscreen for the in-store tablets. **Loads after core and
before onboarding** — it owns the device token that `POST /sessions` needs, and load order
is what guarantees the token is available by the time onboarding submits.

**Inert on the public site.** No token → `isKiosk()` is `false`, `authHeaders()` is `{}`,
no heartbeat, no idle timer, no network calls at all. `data-kiosk-state` is `"web"`.

**The token** is the only long-lived credential in the frontend. It identifies a *device*,
not a person. `localStorage` (it must outlive sessions — the session id stays in
`sessionStorage` so the next shopper never resumes the last one's run), stored alongside
the cached `kiosk` and `config` so the attract screen renders before the first network
call and still renders when the store wifi is down. Shown by the server exactly once, at
pairing; there is no endpoint to read it back.

**Fullscreen** comes from the Fullscreen API on a capture-phase `pointerdown`, not from a
PWA — a manifest's `start_url` must be same-origin as the manifest and a service worker
must be same-origin as its pages, so both need root-path files Webflow cannot serve. Chrome
Android hides the address bar *and* the status bar, which is the whole kiosk look.
- Gated on `data-kiosk-locked` — a paired device, or one armed with `?fullscreen`.
  Deliberately *not* the pairing gate, which is on for everyone: routing that into this
  hook would apply the touch hardening and fullscreen-on-tap to every phone and every
  developer. Opt out on a paired device with `data-kiosk-fullscreen="off"` (read
  document-wide — one device, one answer).
- **Every** tap re-arms it, not just the first: a system dialog can drop the tablet out
  mid-shift and the next touch restores it. No-op when already fullscreen.
- **One tap covers the whole journey**, because fullscreen survives same-document
  navigation and Barba never reloads — and it survives the idle reset for the same reason
  (`barba.go()`, not `location.reload()`). Swapping either for a hard redirect drops the
  tablet out of fullscreen on every lap.
- `kiosk.fullscreen()` reports `{ active, wanted, supported }`; `kiosk.exitFullscreen()`
  is the manual escape without unpinning. Full device setup: `docs/kiosk-tablet-setup.md`.

**The idle reset** drops the session id (no server call — an abandoned session needs no
cleanup), calls `resetJourney()` and navigates to the attract screen with `barba.go()`.
`idle_timeout_seconds` (90 default) is server-tunable per device; `[data-kiosk-idle-factor]`
multiplies it on a page and belongs on the prize page, where the shopper is photographing
a claim code. Don't add a second idle timer anywhere.

**Which calls carry `X-Kiosk-Token`** (and no others): `POST /sessions`,
`POST /sessions/{id}/spin`, `GET /kiosks/me`, `POST /kiosks/heartbeat`.

**401 vs everything else** — the distinction the whole module turns on. A `401` means the
admin revoked the token: clear it, drop the session, show the unpaired screen. A network
error or a `5xx` means nothing of the sort — *keep* the token and the cached config and let
the next heartbeat sort it out. Clearing on flaky store wifi would strand the tablet.
Equally: never retry `POST /sessions` without the header after a 401, or you quietly create
a `WEB` session on a tablet and the shopper finds out at the wheel.

**States** on `<html data-kiosk-state>` and the panel: `web | unpaired | pairing | active |
disabled`. Contract: `[data-kiosk-pair]` (the panel; its presence makes a page able to
pair), `-pair-input`, `-pair-submit`, `-pair-error`, `[data-kiosk-name]`,
`[data-kiosk-store]`, and `[data-kiosk-when="a b"]` for visibility. Per-page:
`[data-kiosk-screen]` (heartbeat's `screen` field) and `[data-kiosk-idle-factor]`
(multiplies the idle window — put `2` on the spin page so a claim code isn't yanked away).

**Pairing** accepts a `?pair=XXXX-XXXX` deep link (auto-submits, then strips the parameter
via `history.replaceState` — the codes are single-use, so a reload with it still there
would 404 and read as a failed pairing) or manual entry. The input is formatted live: upper
-cased, restricted to the unambiguous alphabet (no `I O 0 1`), dash after four. A `429`
becomes a live countdown on the button from `Retry-After`.

**Heartbeat** every `config.heartbeat_seconds` (default 60), on every screen, for the life
of the app — the admin marks a kiosk offline after ~3 missed beats. It keeps running while
`DISABLED`, which is the only way the tablet learns it has been switched back on without a
reload. Every response's `config` is applied, re-arming the timers.

**Idle reset**: after `idle_timeout_seconds` without touch, drop the session id (no server
call — an abandoned session needs no cleanup) and `barba.go()` to the attract URL.

**The pairing gate** (added 2026-09-02) makes pairing **compulsory, on by default**:
`init()` — which runs on boot and on every Barba `afterEnter`, so "every screen" is
literal — redirects to `/kiosk` whenever there is no token. Sign in first, then the
funnel.
- **There is no public web visitor any more.** Everything that branches on a `WEB`
  session — the spin page's "unavailable" copy, `data-product-next-web` — is now
  effectively unreachable. It stays as the honest fallback if the gate is turned off, but
  nothing new should be built on it.
- **The escape hatch is `?kiosk=off`** (`localStorage flx_kiosk_gate`, `?kiosk` or
  `kiosk.enforce(true)` to restore), per device, for developing in a normal browser. Note
  the polarity: storage holds an *opt-out*, so an untouched device — and one whose
  `localStorage` throws — is enforced. **The gate fails closed**; failing open would put
  a shopper on an unpaired journey, which is what it exists to prevent.
- Skipped when the page can pair (`[data-kiosk-pair]` — how `/kiosk` exempts itself, and
  why a pairing overlay in the persistent shell disables the gate everywhere, correctly),
  when the page sets `[data-kiosk-enforce="off"]`, while a pair request is in flight, or
  when already on the target. Target is `/kiosk`, overridden by `[data-kiosk-pair-url]`
  read *document-wide* — the panel only exists on the page we are going to.
- It also fires from `unpair()`, which is the real payoff: an admin revoking a token
  mid-shift now returns the tablet to the pairing screen instead of letting the shopper
  finish a journey that will be refused at the wheel.
- `kiosk.gate()` prints enforced / paired / target / whether this page redirects and why.

**The dev code `5555-5555`** pairs locally with no network call — a fake token and a fake
kiosk record. With pairing compulsory, every tester needs a code, and minting a real one
in the admin dashboard for each of them is friction the gate should not create; this is
that bypass, and it is also what lets the tablet behaviour be exercised before an admin
can issue real codes at all. It satisfies `isKiosk()`, the gate, fullscreen and the idle reset. It cannot
make the session `KIOSK`: **`authHeaders()` returns `{}` for a dev token**, because a fake
token would come back `401` and a `401` means *revoked*, which unpairs the device. So the
session is `WEB`, `POST /spin` 409s, and the wheel is reached with `?demo` instead.
Heartbeat and `GET /kiosks/me` are skipped for the same reason, which means a dev device is
invisible to the admin list. Marked `<html data-kiosk-dev="true">`, warns once on pairing,
and reported by `kiosk.isDev()`.

### flexicare-spin.js
`/spin-to-win` — the prize wheel. The one **kiosk-only** page in the funnel.

**The server owns the outcome.** There is no client-side randomness anywhere in the file
and there must never be: `segment_index` in the `POST /spin` response *is* the result, and
stock and pacing are enforced server-side.

**The animation is ONE gesture.** Tap → ask the server where to land → a single
ease-in-out that winds up and settles (`data-spin-duration` 3s, `data-spin-ease`
`power2.inOut`, `data-spin-turns` 3). It deliberately does not move before the answer
arrives: a single speed-up-and-slow-down has to know where it ends before it begins, and
starting first is exactly what produced the earlier two-part motion (a flat spin, then a
separate braking phase). After `data-spin-wait` (0.4s) it starts turning anyway rather
than sitting frozen on flaky store wifi, and then *decelerates* (`data-spin-ease-out`)
instead of easing in from a moving wheel, which would brake it to a stop first.
`data-spin-min` applies only to that fallback path.

**One `GET /sessions/{id}` answers everything**: is it `COMPLETED`, is the channel
`KIOSK`, is there a `phone_number`, does `has_prize` say it already spun, and which store.
A `WEB` channel is detected up front and shows the "unavailable" panel rather than letting
someone tap a wheel that is guaranteed to 409.

**Idempotent**: the server records exactly one award per session and re-calling `/spin`
returns the same one, so a double-tap, a dropped connection or a reload mid-animation are
all safe. On re-entry the page doesn't even ask — `has_prize` sends it to
`GET /sessions/{id}/prize`.

**The wheel is drawn, not authored.** Webflow supplies an empty square
`[data-spin-wheel]`; the script injects one `<svg>` (`viewBox="0 0 200 200"`,
`data-js-injected` so transition.js's class sync skips it) built from
`GET /prizes/wheel`. Segment count, order, labels and hex colours are all admin data — a
hand-built seven-slice wheel breaks the first time someone adds a prize. Angles are degrees
**clockwise from 12 o'clock** throughout (SVG's own 0° is 3 o'clock, hence the `-90` in
`polar()`); the landing rotation is `pointerAngle - (index + 0.5) * step`, normalised, plus
`data-spin-turns` full rotations so the deceleration reads as one continuous spin. Colours
are validated as plain hex before they reach the DOM, and every string from the API is
written as `textContent`, never HTML. A one-segment wheel is drawn as a `<circle>` (the arc
would collapse). Radial labels flip on the left half so they never appear upside down.

**Nothing here may block the flow.** Every failure — `503` wheel not configured, network
down, an unexpected `409` — lands on the same fallback copy ("ask a Clicks team member").
The shopper keeps their results and their images. The spin is the one part of the journey
allowed to simply not happen. The §7.4 error table is implemented status-code-first, then
`detail`.

**States** on `[data-spin]` and `<html>`: `loading | ready | spinning | prize | consolation
| redeemed | expired | voided | nophone | unavailable | error`, plus `data-spin-reason`
(`web | wheel | already-spun | other-kiosk | disabled | rate-limit | network | unknown`).
`[data-spin-when="a b"]` is the single visibility mechanism for every panel — one page, no
second Barba navigation, so the claim code can never be lost to a swap. A consolation award
still *has* a claim code but must never emphasise it; the script leaves `[data-spin-claim]`
empty and hides `[data-spin-claim-wrap]`.

Full attribute contract at the top of the file; the Webflow build guide (including why SVG
over conic-gradient or canvas, and the stage/pointer/hub structure) is
`docs/kiosk-and-spin.md`.

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
- **The kiosk device token** — issued by the backend at pairing, held in the tablet's
  `localStorage`. Not in this repo and not obtainable from it: an admin generates a pairing
  code in the admin UI and the tablet exchanges it once. See `docs/kiosk-and-spin.md`.
