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

## 2026-08-19 — Page identity can be overridden per page (nav hidden on the reveal)
- src/transition.js, ARCHITECTURE.md
- pageIdentity() now honours data-page-id on the INCOMING Barba container and falls back
  to the URL as before. data-page-id="landing" on a container therefore gives that page
  the landing page's chrome — which is how /meet-your-two-selves keeps the nav collapsed.
  Read from data.next.container so it applies on the way in, not a frame late.
- WEBFLOW SIDE: add data-page-id="landing" to the /meet-your-two-selves Barba container.
  Nothing else changes; data-show-except stays "landing" on the nav wrapper.

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
