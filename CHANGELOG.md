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

## 2026-08-31 — Glass: chromatic aberration removed, light angle now sweeps on a loop

`src/glass.js` + `src/slider.js`.

- **Chromatic aberration removed.** `data-lg-ca` is gone. The displacement filter used
  to run three passes at different scales (one per colour channel) and recomposite
  them; it is now a single pass, and the `feChannel`/`feAdd` helpers that only existed
  for the split were deleted with it. `ca` is out of `DEFAULTS`, `REFRACT_KEYS`, the
  `pill` preset and the tuner. Cheaper as well as cleaner — three fewer filter
  primitives per host.
- **The light angle sweeps 0 → 360 on an 8-second loop, site-wide.** One global
  `lightPhase` is ADDED to each host's `data-lg-lightangle`, so it reads as a single
  light source travelling across the page and any authored offset between two pieces
  of glass is preserved. `lightangle` only feeds `applyChrome` (a box-shadow string),
  so the sweep never rebuilds a displacement map or re-writes a backdrop-filter — but
  it is a box-shadow repaint per host per frame, so watch it on a page with many glass
  elements. Skipped under `prefers-reduced-motion`.
  - Opt out per element: **`data-lg-lightspin="0"`** (new attribute — set it in the
    Designer on anything that should hold a fixed angle).
  - Opt out globally: **`LiquidGlass.lightSpin(seconds)`**, 0 to stop and restore
    authored angles. The tuner calls `lightSpin(0)` on open, or the light-angle dial
    would be overwritten 60 times a second and appear dead.
  - Hosts are now tracked in a plain `hosts` array beside the `states` WeakMap (a
    WeakMap can't be walked), pruned by `isConnected` in the loop — Barba removes an
    outgoing container's nodes without telling us.
- Header comment: `press`/`tilt` were documented as defaulting to 1 and 7; both have
  actually defaulted to 0 (off). Corrected — no code change.

---

## 2026-08-31 — Glass: saturation and tint out, blur made real, tuner names targets by attribute

Site-wide changes to the glass effect, all in `src/glass.js` + `src/slider.js`.

- **Saturation removed.** `data-lg-saturate` is gone from the defaults, the preset
  knobs, the press boost, the SVG chain and the Safari/Firefox fallback. Glass now
  takes the colour of whatever is behind it, unaltered.
- **Tint removed.** `data-lg-tinthue` / `data-lg-tintamount` are gone; the surface
  overlay is `frost` + `glow` only.
- **Blur actually blurs now.** It was an `feGaussianBlur` inside the displacement
  filter at `stdDeviation = blur * 0.5`, and that filter's region is pinned to the
  element box — so it sampled transparent past the edge and ate its own rim, which is
  why the knob looked inert. It is now a native `blur()` applied in front of the
  displacement filter (`backdrop-filter: blur(8px) url(#lg-3)`), so `data-lg-blur` is a
  true pixel radius. **Default raised 2 → 8** and the tuner's range widened to 0–40;
  the `nav` preset's `blur: 1.5` override was dropped so it takes the new default.
  Blur no longer feeds the displacement map, so it is out of `REFRACT_KEYS` — changing
  it re-applies the backdrop-filter string without a map rebuild.
- **Tuner target dropdown lists the attribute contract**, not the div. Rows now read
  `data-lg-preset="button-glass"`, or the element's explicit `data-lg-*` overrides, or
  `data-liquid-glass (no overrides)` — numbered when several elements share one. The
  old labels were tag names and text snippets, which said nothing about what you were
  about to tune.

Note for Webflow: the wheel-stage rule in Site Settings → Custom Code still reads
`backdrop-filter: blur(14px) saturate(1.25)`. That is hand-written CSS, not glass.js —
drop the `saturate(1.25)` there by hand. Documented in `docs/kiosk-and-spin.md`.

---

## 2026-08-31 — Docs caught up before the glass phase

Documentation only — no behaviour change. Closing the gaps a fresh session would
have fallen into:

- `CLAUDE.md` — the `/kiosk` page under the kiosk script; the lead-form gate under
  `flexicare-spin.js`; and three new "will bite you" bullets: the four lead fields
  with no backend, the `style.display = ""` fallback trap (which cost the invisible
  error box), and **the connector reads the Designer while the browser shows the
  published site** — a stale publish burned a whole debugging round today.
- `docs/webflow-mcp.md` — `/kiosk` added to the page-id table; open items updated
  with the unbacked lead fields, the two stray `.fc-error` divs still to delete on
  `/spin-to-win`, and the two placeholder combo classes created from the connector.
- `docs/kiosk-and-spin.md` — §4 marked as built and wired, with the page id.

Still open, carried forward: the `/spin-to-win` stray divs need deleting in the
Designer (element removal, needs an explicit yes), and a pairing code from the
backend admin is needed before the kiosk chain can be tested end to end.
---

## 2026-08-28 — Error-state styling for the lead form (Webflow)

**Webflow (unpublished). Two NEW combo classes — no shared class was touched.**

- `.field-glass.is-invalid` — `box-shadow: 0 0 0 1.5px rgba(255,107,107,.95)`.
  A ring rather than a border: `.field-glass` is a `data-liquid-glass` host and
  the glass overlay sits over the box, so an inset border can be covered. Colour
  is a placeholder — the palette is lime/indigo/teal and has no error red.
- `.fc-error.is-lead-copy` — colour, size, line-height, margin. Applied to the
  lead error box. `display` is deliberately NOT set here: the base `.fc-error`
  keeps `display:none` so the box stays hidden until the script writes a message.

`data-spin-lead-field` moved from the five `.field-wrapper` divs onto the
`.field-glass` boxes inside them, so the invalid ring hugs the input instead of
enclosing the label as well.

---

## 2026-08-28 — Fix: the lead form's error message never appeared

- `src/flexicare-spin.js` — `leadError()` showed the box with
  `el.style.display = ""`, which falls straight back through to the authored
  `.fc-error { display: none }`. The message was being written correctly and
  was invisible every time. It now captures the display the Designer intends
  (computed once, before the box is ever hidden) and restores that, so a box
  styled as flex comes back as flex rather than being forced to block. Same
  class of trap as the panel pre-boot rule.
- Validation now returns **which** field failed, not just a message: the
  offending wrapper gets `is-invalid` (override with `data-invalid-class`), the
  input gets `aria-invalid="true"` and focus. One message at a time, in reading
  order — six at once is worse than being walked down the form. Empty-vs-malformed
  are now separate messages, and the ID error says how many digits were typed.
- Typing anywhere in the form clears the message and the invalid mark. An error
  that persists while you fix it reads as "still wrong".

**Webflow (unpublished):** `data-spin-lead-field` on the five `.field-wrapper`
elements, so the invalid state lands on something the Designer can style — the
input itself is inside an HTML Embed.

---

## 2026-08-28 — Fix: submitting the demo lead form bounced to /onboarding

- `src/flexicare-spin.js` — `submitLead()` checked "no session id → go to
  /onboarding" BEFORE the `?spindemo` bypass. Demo mode has no session by
  design, so every submit on `/spin-to-win?spindemo=form` navigated away
  instead of unlocking the wheel. The demo check now comes first.

---

## 2026-08-28 — The spin CTA doubles as the lead form's submit

- `src/flexicare-spin.js` — in state `form` the `[data-spin-go]` button submits
  the form instead of spinning, and relabels itself (`data-spin-lead-label` on
  `[data-spin]`, default "Submit"), reverting once the form is accepted. It also
  gets `data-spin-go-mode="submit"|"spin"` so the two jobs can be styled apart.
  A dedicated `[data-spin-lead-submit]` still works and is now optional.
  New `[data-spin-go-text]` marks the CTA's inner text element — Webflow buttons
  wrap their label in a div, so relabelling the button itself would wipe it.
  Why one button: the spin CTA lives in the persistent nav wrapper, outside the
  Barba container and outside every panel, so it is already visible during
  `form` and a second primary button there would be both redundant and awkward.

**Webflow (unpublished):** `/spin-to-win` lead form wired —
`data-spin-when="form"` on `.form-stage`; `data-spin-lead-idtype="id"` /
`"passport"` + `data-selected-target=".fc-consent"` on the two `.consent-wrapper`
rows; `data-spin-lead-idlabel` on the ID Number label; `data-spin-go-text` on
`.primary-button-text`; `data-spin-lead-label="Submit"` on `[data-spin]`.

Removed three onboarding attributes that came across with the copied component
and would have made `flexicare-onboarding.js` initialise on the spin page:
`data-onboarding-form` on `.input-fields-container`, and `data-onboarding-consent`
+ `data-checked-target` on both ID/Passport rows. That last pair mattered most —
both rows carried the SAME consent attribute, so under the onboarding controller
they toggled one shared boolean and lit up together, while the spin controller
was treating them as one-of-two. `data-onboarding-error` also cleared off two
stray boxes.

---

## 2026-08-28 — A lead form now gates the spin wheel

- `src/flexicare-spin.js` — new state **`form`**, between `loading` and
  `ready`. The wheel is rendered as before, but the panel over it must be
  completed first; on success the state flips to `ready` and the gate is
  remembered per session in `sessionStorage`, so a reload does not re-ask.
  New `[data-spin-lead-*]` contract: `-name`, `-surname`, `-phone`, `-email`,
  `-idtype` (`id` / `passport`), `-idnumber`, `-submit`, `-error`, `-idlabel`.
  Prefilled from the session where it already knows the answer. `?spindemo=form`
  builds it with no backend.
- `demo/spin-lead-embed.html` — paste-ready embeds, ONE PER FIELD, matching how
  `/onboarding` is built (own embed inside your own Designer wrapper, `.fc-field`
  classes so the existing `field-style` embed styles them). The ID/Passport
  toggle is deliberately NOT an embed: it is two Designer divs, reflected the
  same way the onboarding gender pills are — a toggled class (`is-selected`,
  overridable with `data-selected-class` / `data-selected-target`) plus
  `aria-checked`, with a native radio synced if one is present.
- `docs/spin-attributes.md`, `docs/kiosk-and-spin.md` — the new state, the panel
  and the full attribute table.

**Only phone and email reach the backend.** `PATCH …/contact/phone` and
`…/contact/email` are real; `name`, `surname`, `id_type` and `id_number` have
**no endpoint anywhere in `docs/api-contract.md`** (checked — the words do not
appear in it). They are buffered on `Flexicare.lead` in memory and are lost on a
hard reload. Deliberate and temporary, agreed with Kenton: the form ships ahead
of the backend. When the endpoints land, `submitLead()` is the one function to
change. **The button says "Call me back" — until those fields are persisted,
nothing downstream can honour that for surname or ID number.**

Two ordering details worth remembering:
- The form gate is checked BEFORE the `nophone` state, because the form is what
  collects the number. Otherwise a session missing a phone would be bounced to
  onboarding by the very panel this replaces.
- `form` had to be added to `syncNav`'s "spinning is still ahead" list. The spin
  CTA lives in the nav and `navReveal` is deliberately one-way — collapsing it
  when the form appeared would have taken the CTA with it, permanently.

**Webflow:** needs a `[data-spin-when="form"]` panel on `/spin-to-win` holding
the fields. Nothing is wired there yet.

## 2026-08-28 — The /kiosk pairing page, wired

**Webflow (unpublished, applied via the MCP connector):**
- New page `/kiosk` (duplicated from `/onboarding`, so the persistent shell
  structure matches). Wired: `data-kiosk-pair` + `data-kiosk-attract="/"` +
  `data-kiosk-version="1.0.0"` on `.kiosk-panel`; `data-kiosk-when` on the four
  state panels (`unpaired`, `pairing`, `active`, `disabled`);
  `data-kiosk-pair-input` (inside the field HTML Embed), `data-kiosk-pair-submit`,
  `data-kiosk-pair-error`; `data-kiosk-name` / `data-kiosk-store` on the paired
  info slots; `data-page-id="landing"` on the container so the nav collapses.
- Site head: the kiosk pre-boot rule
  `[data-kiosk-pair]:not([data-kiosk-state]) [data-kiosk-when]{display:none}`
  beside the spin CSS, plus `pointer-events:none` for the disabled Pair button.
  Site-wide for the same reason as the spin block — Barba never swaps `<head>`.

- `src/flexicare-kiosk.js` — `init()` now calls `clearPanelError()`.
  `[data-kiosk-pair-error]` is not an authored-copy fallback the way
  `[data-spin-error]` is; it only ever holds a server message. Nothing cleared
  it before the first failed attempt, so Webflow's default div text sat on the
  unpaired screen looking like a real error until the operator typed.

## 2026-08-27 — Spin CSS moved site-wide: the panel flash on /spin-to-win

**Webflow (unpublished, applied via the MCP connector):**
- The spin wheel's CSS block moved OUT of `/spin-to-win` → Page Settings →
  Custom Code → Head, and INTO Site Settings → Custom Code → Head (appended
  after the font-smoothing and viewport blocks). The page head now holds only
  a comment saying where it went and why.

**Why:** navigating to the page showed both `.spin-panel` divs (prize +
message) and the stage stacked for a beat before the script hid them. The
pre-boot rule `[data-spin]:not([data-spin-state]) [data-spin-when]{display:none}`
was correct — it just was not on the page. **Barba never swaps `<head>`**, so a
destination page's own head code is absent on every in-funnel navigation, which
is every real visit to the spin page. The rest of that stylesheet was missing
too (square stage, the wheel/hub `backdrop-filter`, the marker's
`rotate(var(--fc-pointer-angle))`) — all of it now applies on arrival.

Every selector is attribute-scoped, so the block is inert on the other nine
pages. Comments were trimmed on the way in to stay under Webflow's site
custom-code limit; the fully-commented version remains `demo/spin-webflow.css`.

- `demo/spin-webflow.css`, `demo/spin-webflow-embed.html`,
  `docs/kiosk-and-spin.md` — all three recommended the PAGE head as the
  preferred location. Corrected to site-wide, with the Barba reason spelled
  out so it does not get put back.

## 2026-08-27 — Spin page: countdown slot + expiry line, and a connector guide

**Webflow (unpublished, applied via the MCP connector):**
- `[data-spin-expires-wrap]` added to the prize card's EXISTING
  `.spin-card_meta-wrapper`. Correction to the earlier audit entry: it claimed
  `[data-spin-expires]` was missing, but only the WRAP was — the slot was there
  all along. No new element was needed.
- New empty `[data-spin-error]` inside `.spin-stage` (the `ready spinning` panel)
  so the 429 cooldown countdown is visible while the CTA is disabled. It carries
  `data-spin-error-copy` with the same sentence as the card's error box —
  **required**, because `showError()` takes its fallback from the FIRST error slot
  in document order and the wheel panel precedes the cards, so an empty slot there
  would otherwise replace the authored copy with the script's hard-coded string.
- New class `.spin-cooldown` (absolute, pinned bottom, `pointer-events:none`) so an
  empty div cannot shift the wheel's layout. No existing class was modified.
  **Its position is a guess** — bottom edge inside the square stage. Restyle freely.

**Docs:**
- `docs/webflow-mcp.md` (new) — the connector guide: the confirm-first rule, setup,
  site and page ids, which tool does what, the traps (embeds are invisible to
  attribute queries; `set_attributes` can't write an id; `set_site_freeform_code`
  replaces the whole block), the shell-diff recipe, and what to keep doing by hand.
- `docs/spin-attributes.md`, `demo/spin-webflow-panels.html` — document
  `data-spin-error-copy`, which existed in the script but nowhere in the docs.
- `CLAUDE.md` — points at the connector guide, and adds the standing rule: never
  add a styling property to an existing class; create a new one.

## 2026-08-27 — Site-wide Webflow attribute audit (no code change)

Applied in the **Webflow Designer** via the MCP connector, not in this repo — so
there is nothing to push for these. Left UNPUBLISHED for Kenton to review.

**Audited:** all 10 funnel pages against each controller's documented contract,
plus the site head/footer custom code. Every page's REQUIRED attributes are
present. The shell ancestor chain is identical across all 10 pages (9 levels,
same types and tags; only classes differ, which is what `syncShellClasses` is
for). The footer points at the Worker URL — nothing pinned to a stale jsDelivr
tag, so pushes are genuinely live. The head snippet setting `window.__fcLayout`
is intact.

**Fixed:**
- `/meet-your-two-selves` — one of the two `[data-reveal-next]` CTAs targeted
  `/flex`, which **does not exist** (404, and its link type was "none" so there
  was no href fallback). Now `/flexicare`, matching the other.
- **25 glass hosts** across 8 pages had `data-anim` (which moves the element)
  instead of `data-anim-fade`. Glass owns `transform`. Avatar 11, reveal 4,
  product 4, start 2, home/onboarding/archetype/flexicare 1 each. The ~10
  non-glass `data-anim` elements were deliberately left alone.
- Debug flags that were logging on the live site: `data-reveal-debug`,
  `data-avatar-debug`.
- `data-checked-target=".fc-consent"` on both quiz option templates — a leftover
  from the onboarding page they were duplicated from. Inert (only
  `flexicare-onboarding.js` reads it) but confusing.
- Footer script order now matches the documented order: GSAP before Barba, and
  onboarding before selfie/avatar. **The file LIST did not change** — no Webflow
  paste needed, and nothing was broken before; this is consistency only.

**Known audit blind spot:** attribute queries do NOT see inside HTML Embeds. The
onboarding inputs (`data-onboarding-name`, `-whatsapp`) and the whole product copy
database live in embeds and first appeared as missing required attributes. Read
them with the element-settings tool's `code` key before believing a "missing
attribute" result. Also: `set_attributes` cannot write an element's id — that's
`set_dom_id` on the settings tool, and the failure gives no hint.

**Still open (needs elements placed in the Designer):** a second, empty
`[data-spin-error]` inside the spin page's `ready spinning` panel so the 429
countdown is visible, and `[data-spin-expires-wrap]` / `[data-spin-expires]` on
the prize card. Deliberately not attempted from here — positioning new elements
is guesswork against layout the API doesn't expose.

## 2026-08-27 — Tapping spin collapses the nav

- `src/transition.js`, `src/flexicare-spin.js`, `ARCHITECTURE.md`,
  `docs/spin-attributes.md`
- New public API: `PageTransition.nav.hide(instant)` / `.show(instant)` /
  `.isHidden()`. It runs the SAME `navReveal()` the landing page's
  `data-show-except` path uses — same duration, easing and glass freeze, and the
  same `__navHidden` bookkeeping, which is the point: a hand-rolled height tween
  would leave `applyVisibility` disagreeing about where the nav is and collapsing
  or reopening it a second time on the next navigation. Needs `[data-nav-reveal]`.
- `/spin-to-win` now collapses the nav the moment the wheel starts turning: the
  spin CTA lives in the nav, so it is spent, and the next step is the landing page
  where it is collapsed anyway — so it is deliberately NOT restored on teardown.
  It returns in exactly one case: the state goes back to `ready` (a 429 cooldown,
  a retryable network error), because the CTA is inside it.
- On the first paint (a reload that recovers an award, a web session refused up
  front) the collapse is instant — animating there would open the nav with the
  page entrance and immediately shut it again.
- **No Webflow change needed** beyond what is already there (`data-nav-reveal` on
  `button-navigation-wrapper`). Opt out with `data-spin-nav-hide="off"` on
  `[data-spin]`. Note the collapse returns its space to the layout, so a `flex:1`
  sibling — the spin stage — grows into it as the nav goes.

## 2026-08-27 — The panel swap animates (wheel out, card in)

- `src/flexicare-spin.js`, `docs/spin-attributes.md`, `demo/spin-webflow-panels.html`
- `applyWhen()` used to toggle `display` outright, so the wheel vanished the
  instant an award landed. It now scales + fades the outgoing panel out and the
  incoming one in. New optional attributes on `[data-spin]`:
  `data-spin-panel-in` (0.45s), `-out` (0.28s), `-overlap` (0s),
  `-scale` (0.94), `-scale-out`, `-ease` (power2.out), `-ease-out` (power2.in).
  All defaulted — **no Webflow change is required** for the animation to work.
- **Webflow-side, if you want the scale on the cards:** a panel that is itself a
  glass host fades WITHOUT scaling (glass owns `transform`; its press spring
  resets to the transform captured at attach and would wipe the tween). Move
  `data-liquid-glass` off `[data-spin-when]` and onto a card div inside it. The
  console warns once when it finds them on the same element.
- `-overlap` defaults to 0 (strictly sequential) because that is the only safe
  default while panels are siblings in normal flow. Stack them in one grid cell
  before raising it, or both sit in the layout for the overlap and the page jumps.
- Nested panels skip their own motion when the parent panel is also changing —
  the outermost carries it, or fades multiply and scales compound. A block whose
  parent stays put (`redeemed` → `expired`) still animates.
- Skipped under `prefers-reduced-motion` and on the first paint of a page.

## 2026-08-27 — The spin result panels, as two card templates

- `demo/spin-webflow-panels.html` (new)
- Build reference for every post-wheel state on `/spin-to-win`, as **two** card
  layouts rather than eleven: **A** the prize card (`prize` — the only state with
  a claim code, expiry and store), **B** one message card whose outer
  `[data-spin-when]` lists `consolation redeemed expired voided nophone
  unavailable error` and whose copy is switched by NESTED `[data-spin-when]`
  blocks. Nesting works because `applyWhen()` evaluates each one independently,
  so the card chrome is authored once.
- Documents three things that catch people out: there is no "no prize" state
  (`consolation` is it, and its claim code must never be shown); `nophone` is the
  one state with a different CTA (`data-spin-back` → `/onboarding`); and the 429
  cooldown writes its countdown into `[data-spin-error]` while the state is still
  `ready`, so a SECOND (empty) error slot belongs inside the `ready spinning`
  panel or the countdown is invisible.
- No script change, no Webflow footer change. Companion to
  `demo/spin-webflow-structure.html`, which covers the stage, wheel and CTA.

## 2026-08-26 — Kiosk mode + the prize wheel (spin-to-win)

**New files.** The Webflow footer script list CHANGED — see the block in
`docs/hosting-and-publishing.md` and paste it into Webflow → Project Settings →
Custom Code → Footer. Two additions, and **order matters**:
`flexicare-kiosk.js` goes directly after `flexicare-core.js` and **before**
`flexicare-onboarding.js`; `flexicare-spin.js` goes after `flexicare-product.js`.

- `src/flexicare-kiosk.js` (new) — `window.Flexicare.kiosk`. Device pairing
  (`?pair=` deep link + manual entry with live formatting and a `Retry-After`
  countdown), the device token in `localStorage`, `GET /kiosks/me` on boot, the
  heartbeat loop with server-driven config, and the idle reset back to the attract
  screen. Completely inert on the public site: no token, no header, no network calls.
- `src/flexicare-spin.js` (new) — `/spin-to-win`. Draws the wheel as SVG from
  `GET /prizes/wheel` (segment count/order/labels/colours are all admin data),
  spins on tap *before* the response, lands on the `segment_index` the server
  returns, and renders the claim code. Handles the whole §7.4 error table, resume
  via `has_prize` → `GET /sessions/{id}/prize`, and the consolation case (no
  claim-code emphasis). Every failure path lands on the same fallback copy — the
  spin is never allowed to block the flow.
- `src/flexicare-core.js` — `FC.api()` gained `opts.kiosk` (attaches
  `X-Kiosk-Token` when paired) and `err.retryAfter` (seconds, from the `Retry-After`
  header on a 429). Added `FC.config.kiosk` fallbacks; `resetJourney()` now clears
  `FC.award`.
- `src/flexicare-onboarding.js` — `POST /sessions` now passes `kiosk: true`. **This
  is the change that makes the spin possible at all**: it is what makes the session
  `channel: "KIOSK"`. Added 401/403 handling that shows an operator-facing message
  and, critically, never retries without the header (that would silently create a
  `WEB` session on a tablet).
- `src/flexicare-product.js` — new optional `data-product-next-web` on
  `[data-product]`: the CTA target used instead of `data-product-next` when the
  device is not a paired kiosk, so web visitors can skip the kiosk-only wheel.
  Unset, behaviour is unchanged.

**Docs.** New `docs/kiosk-and-spin.md` — the Webflow build guide: why the wheel is
drawn by JS rather than authored in the Designer, the stage/pointer/hub structure to
build, the full panel markup, the pairing page, and a testing checklist.
`docs/api-contract.md` gained §6 (kiosk) and §7 (prize wheel) plus the kiosk fields
on §3.2/§3.6; the old §6 checklist is now §8. `ARCHITECTURE.md` and `CLAUDE.md`
updated (load order, two new module sections, four new gotchas).

**Webflow side — what still needs building:**
- A `/spin-to-win` page with `[data-spin]`, an empty square `[data-spin-wheel]`,
  `[data-spin-go]`, and the `[data-spin-when="…"]` panels. Full markup in
  `docs/kiosk-and-spin.md` §3.
- A `/kiosk` pairing page with `[data-kiosk-pair]` and friends (§4 of the same doc).
- `data-kiosk-idle-factor="2"` on the spin page so a claim code isn't yanked away.
- Optionally `data-product-next-web` on `[data-product]`.

**Dev gate — `?spindemo`.** The spin page can't render anything until a tablet is
paired, which makes it impossible to build in the Designer. `?spindemo` skips the
session and draws the real wheel with a fake prize screen (`=consolation`,
`=redeemed`, `=expired`, `=voided`, `=nophone`, `=unavailable` jump to a specific
panel). It never calls `POST /spin`, never creates an award and never writes
`Flexicare.award`. Gated exactly like `?tune`/`?orbtune`. Remove the parameter for
real testing.

**The wheel is GLASS, not brand colours.** `data-spin-style` now defaults to
`"glass"`: segments are two alternating translucent panes with hairline dividers,
an outer rim band, and a pearl stud at every segment boundary (count-dependent, so
the script draws them; they sit inside the rotor and turn with the wheel). All the
colour comes from a blurred three-blob layer BEHIND the wheel — `#AADB1E`,
`#3D45E0`, `#1EBEAA` — and the only flat colour on the page is the primary button.

The API's per-segment `color` is therefore **not painted as a fill** any more.
`data-spin-tint` (0–1) blends it back in, and `data-spin-style="solid"` restores the
old behaviour outright. Worth telling the backend dev, since the admin UI implies
those colours drive the look.

Because the segments are translucent, `[data-spin-wheel]` can now itself be a glass
host and refract the colour layer — which exposed a **real bug**: `renderWheel()`
cleared the box with `innerHTML = ""`, destroying glass.js's injected `.lg-layer`.
`attach()` is one-way (it guards on an internal states map), so a later `scan()`
would never rebuild it and the glass silently lost its lighting layer on the first
redraw. The controller now clears only what it owns, keeping any `data-lg-*` node.

**The spin is one gesture now.** It used to be two visibly separate phases — a flat
constant-speed spin while the request was in flight, then a separate braking phase —
because the wheel started before it knew where to stop. It now waits for the server's
answer (a few hundred ms) and runs a single ease-in-out: `data-spin-duration="3"`,
`data-spin-ease="power2.inOut"`, `data-spin-turns="3"`, all tunable.

The old behaviour survives as a slow-response fallback: after `data-spin-wait`
(default 0.4s) the wheel starts turning anyway rather than sitting frozen on flaky
store wifi, and the landing then *decelerates* (`data-spin-ease-out`) instead of
easing in again — easing in from a moving wheel would brake it to a stop first, a
visible hitch. `data-spin-min` now applies only to that path.

**`[data-spin-go]` can live anywhere**, including a nav bar in the persistent shell
outside `data-barba="container"`. Clicks were always document-delegated so they
worked already; what didn't was the enabled/disabled state, because element lookups
are scoped to the incoming container. `slots()` now falls back to the shell — filtered
to nodes outside EVERY barba container, which is what keeps the outgoing-container
bug away, since shell elements are never duplicated during a swap.

**`docs/spin-attributes.md`** — the complete attribute reference for the spin page:
every config attribute with its default and range, every structural hook, every panel
state and reason code, every content slot, and the attributes the script writes onto
the injected SVG. Tests check it against the source, so a default that drifts or an
attribute that gets added without being written up fails the suite.

**Fixed in `glass.js`: `data-liquid-glass` clobbered author positioning.** The hook's
stylesheet set `position:relative` on every host. It is appended at
script-execution time, and these scripts load in Webflow's FOOTER, so it landed after
the site stylesheet and won at equal specificity (`[data-liquid-glass]` and
`.some-class` are both 0,1,0) — an absolutely-positioned element snapped back into
normal flow the moment glass was added to it, silently. This is what put the spin
dial below the wheel instead of at its centre.

Glass only needs the host to CONTAIN its overlay, and `absolute`, `fixed`, `sticky`
and `relative` all do that. `attach()` now reads the author's true computed position
and marks `data-lg-static` only when it is actually static; the stylesheet scopes
`position:relative` to that marker. A marker rather than a blanket rule on purpose:
a blanket rule would already have made every host relative by the time we looked.
Static hosts behave exactly as before, so this only ever relaxes the old behaviour.

**Layout audit for hand-built pages.** Building this page means positioning five
elements against one another, and when one is wrong the symptom is visual while the
cause is not — a dial parked below the wheel and an invisible pointer both look like
script bugs and are almost always a CSS box. With `data-spin-debug` (or `?spindemo`,
which implies it) the script now measures the stage, wheel, dial, marker and pointer
on every render, logs the boxes, and names the specific fault and its fix: a static
stage, a stretched stage, a static dial, a static marker, a marker with nothing
inside it, or a zero-size pointer.

Two related hardenings: `[data-spin-stage]` gained `align-self/justify-self: center`,
because a flex or grid parent stretches its children by default and a stretched
height silently overrides `aspect-ratio` — which gives a stage taller than it is
wide, a letterboxed wheel, and a dial at `top:50%` landing near the bottom. And the
embed now carries a commented-out starter `[data-spin-pointer]`, since the embed
deliberately doesn't style your pointer graphic and an unstyled div is an invisible
one.

**Fixed: a strong sheen washed out the labels.** The specular overlay is drawn
after the rotor so it stays put while the wheel turns — which also put it *above*
the label text. Invisible at the old 0.14 default, a heavy white veil over white
type at the tuned 0.48. The wheel now uses TWO rotating groups with the sheen
sandwiched between them: panes and lit edges in the back group, the fixed sheen,
then labels and icons in the front group. Both groups are driven by a single tween
so they cannot drift apart by a frame.

**Webflow handover.** Three new files:
- `demo/spin-webflow.css` — the only CSS the wheel needs. Entirely
  attribute-driven (no class names, so Webflow classes can be named freely), and
  limited to what the Designer cannot express: `backdrop-filter`, the pointer's
  `rotate(var(--fc-pointer-angle))`, the injected SVG labels, `[aria-disabled]`,
  and a rule that stops every panel flashing on screen at once before the
  footer-loaded script boots. That last one is scoped as
  `[data-spin]:not([data-spin-state]) [data-spin-when]` on purpose — a blanket
  `[data-spin-when]{display:none}` would break "show", because the script reveals a
  panel by CLEARING its inline display.
- `demo/spin-webflow-embed.html` — that same CSS wrapped in `<style>`, paste-ready.
  Generated from the `.css`, and a test asserts the two cannot drift apart.
- `demo/spin-webflow-structure.html` — the complete element/attribute reference for
  the page, heavily commented. Tests assert it covers every panel state, every slot
  the script writes into, and every hook the CSS keys off, so it cannot fall behind
  the contract.

New structural hooks the script does not read but the CSS keys off:
`[data-spin-stage]`, `[data-spin-hub]`, `[data-spin-marker]`, `[data-spin-glow]`.
The playground now uses those instead of classes, links the same stylesheet (so it
proves the embed), and its panels and buttons are stripped to a plain **template** —
they are rebuilt in Webflow, along with the background gradient.

The script also warns when `[data-spin-wheel]` is not square, which letterboxes the
wheel inside itself and silently stops the marker lining up with the winning segment.

**Tuned defaults + per-pane glass.** The design's tuned values are now the script
defaults: rim and studs off, no hard dividers, label size 5 at radius 87. Two new
cues make each pane read as its own piece of glass, because `backdrop-filter` cannot
be applied to an SVG shape (per-segment "real" glass would mean one clipped div with
its own backdrop-filter per segment, all recompositing every frame while spinning):
`data-spin-edge` draws a lit hairline down each pane's leading edge, fading toward
the hub; `data-spin-sheen` lays a specular overlay across the disc that does **not**
rotate with the wheel — light that turns with an object reads as paint, light that
stays put reads as glass. The single real blur lives in CSS on the wheel canvas, and
the dial gets a second gentler one.

**The pointer angle now has one source of truth.** The landing maths reads
`data-spin-pointer-angle`; the visible marker is CSS. Set in two places they drift,
and the failure is silent — the wheel stops with the winning segment somewhere other
than under the marker. The script now publishes the angle as `--fc-pointer-angle` on
the `[data-spin]` wrapper for the CSS to rotate by.

**Standalone playground — `demo/spin.html`.** A single self-contained page that
loads the real `flexicare-spin.js`: full component markup, starter CSS, and a tuner
that writes the `data-spin-*` attributes live (animation knobs apply to the next
spin; rendering knobs redraw the wheel via a new `Flexicare.spin.reinit()` dev hook).
Buttons jump to any panel, and it exports a paste-ready attribute block. Works
offline with placeholder segments. Run it with `python3 -m http.server 8080`, or
open `/demo/spin.html` on the deployed preview. Craft the look here first — Webflow
adds nothing while the component is still being designed.

**The thing to remember:** the spin is decided at `/onboarding`, not at
`/spin-to-win`. If the spin page says "unavailable", the session was started on an
unpaired browser — fix it there.

**Verified** with 119 assertions against the real files in a jsdom harness: wheel
geometry and landing maths for 1–12 segments at four pointer positions; the spin
page's ready/spin/land/prize path, consolation, resume, the web dead-end, and every
row of the §7.4 error table; kiosk pairing (manual, deep link, 404, 429), boot,
disabled, revoked-token, network-failure-keeps-token, and web-inertness; and the
onboarding seam (header present on a tablet, absent on the web, no bare retry after
a 401/403).

---

## Where things stand — 2026-08-27 (end of the kiosk + spin-to-win pass)

A snapshot for the next session. The previous snapshot (2026-08-26, the FLEX +
product-page pass) is superseded and appears below; everything in it still holds
except the journey now continues past `/flexicare-product`.

**Journey:** landing → selfie **or** avatar picker → onboarding → `/archetype`
(ROUTING quiz) → `/meet-your-two-selves` (reveal) → `/flexicare` (FLEX quiz) →
`/flexicare-product` (recommendation) → `/spin-to-win` (the prize wheel, **kiosk
only**).

**What this pass added:** `src/flexicare-kiosk.js` (device pairing, heartbeat, idle
reset) and `src/flexicare-spin.js` (the wheel), plus the seam in onboarding that makes
a session `channel: "KIOSK"`. Everything is on `main` and live; tagged `v1.1.0`.

**The one thing to internalise:** the prize spin is decided at `/onboarding`, not at
`/spin-to-win`. A session can only spin if `POST /sessions` carried `X-Kiosk-Token`;
on a `WEB` session `POST /spin` is a hard 409. So it is a chain — pair the tablet →
token in `localStorage` → header on session create → header on spin — and breaking any
link means the shopper completes the whole journey and is refused at the wheel. If the
spin page says "unavailable", the session was started on an unpaired browser.

**Where things are up to on the Webflow side.** The wheel component is BUILT and
working. Still to build: the other panels (`prize`, `consolation`, `redeemed`,
`expired`, `voided`, `nophone`, `unavailable error`), and the `/kiosk` pairing page.
That is the next phase.

**Read these before touching the spin page:**
- `docs/spin-attributes.md` — every attribute with its default and range.
- `demo/spin-webflow-structure.html` — the complete element/attribute reference.
- `demo/spin-webflow-embed.html` — the CSS that must be in the page head.
- `docs/kiosk-and-spin.md` — why any of it works the way it does.
- `https://flexicare.kenton-323.workers.dev/demo/spin?spindemo` — the live playground.
  `?spindemo=consolation` (or `=redeemed`, `=expired`, `=voided`, `=nophone`,
  `=unavailable`) jumps straight to a panel, which is how you build and style the
  states without a paired tablet or a completed session.

**Two fixes in this pass that were NOT spin-specific:**
- `glass.js` no longer forces `position:relative` on every `data-liquid-glass` host —
  only on ones that were actually `static`. It had been silently overriding author
  positioning site-wide, because its stylesheet is injected from the footer and won at
  equal specificity. Anything you positioned *and* gave glass to will now sit where
  you put it.
- `FC.api()` gained `opts.kiosk` (attaches `X-Kiosk-Token`) and `err.retryAfter`.

**Diagnostics.** `data-spin-debug` (or `?spindemo`, which implies it) makes the script
measure the stage, wheel, dial, marker and pointer on every render and name the
specific layout fault and its fix. Use it before theorising — a dial in the wrong place
and an invisible pointer both look like script bugs and are almost always a CSS box.

**Testing.** There is no test runner in the repo (no build step, by design). The suites
used during this pass ran from a scratch directory with `jsdom` installed outside the
repo — 404 assertions covering the wheel maths, the controllers, the kiosk seam, the
glass integration and the docs' own accuracy. If you need them again, they are
reconstructible from the module contracts; nothing in the repo depends on them.

---

## Where things stand — 2026-08-26 (end of the FLEX + product-page pass)

A snapshot for the next session, so nothing below has to be re-derived. Details are in
the dated entries under it. The previous snapshot (2026-08-24, the reveal-page debugging
pass) is superseded; its fixes are all in the dated entries below.

**Journey as it stands — now complete end to end:**
landing → selfie **or** avatar picker → onboarding → `/archetype` (ROUTING quiz) →
`/meet-your-two-selves` (reveal) → `/flexicare` (FLEX quiz) → `/flexicare-product`
(the recommendation). All of it is built and working on the live site.

**What this pass added:**
- `/flexicare` — the FLEX quiz. NO new code: `flexicare-quiz.js` already ran both stages.
  The page is a Webflow duplicate of `/archetype`; only the `[data-quiz]` config differs
  (`data-quiz-stage="FLEX"`, `-back`, `-done`, `-progress-start/-end`).
- `src/flexicare-product.js` (NEW) — `/flexicare-product`. Renders the plan the server
  picked from `Flexicare.result` (the `/finish` response). No polling; every value is
  resolved server-side, so it paints in the same frame on a `barba.go()` arrival.
- `docs/product-copy-embed.html` — the paste-ready copy database, keyed on **archetype AND
  product** (`data-copy-for="A:PLUS"`).
- The Webflow footer gained ONE line (`flexicare-product.js`). Nothing else changed.

**The bug that cost this pass the most time — read this before cloning anything.**
The product page's benefit rows are cloned from an authored template, and they rendered
wrong in four different ways before the real cause surfaced. Only the last one mattered:
**a clone built during `afterEnter` inherits the entrance animation's INLINE state.**
transition.js writes `transform`/`opacity` inline on `[data-anim]` and clears them when the
tween ends — but the tween points at the template, not the clones, so the clones keep a
frozen `translateY` forever. Stripping the *attribute* is not enough; the transform lives
on the element regardless. `clearInlineMotion()` now wipes inline
transform/opacity/filter/visibility across the whole cloned subtree.
Two lesser lessons from the same hunt: **hiding an authored template is unreliable**
(an inline `display:none` loses to a Webflow class with `!important`, and an attribute rule
of our own gets inherited by the clones and hides everything) — it is now DETACHED instead;
and the list attributes are **swap-prone** (container OUTSIDE, template INSIDE), so the
script detects the inversion, recovers, and warns.

**Diagnostics — use them before theorising.** `Flexicare.product.debugList("plan-benefit")`
prints the resolved container and template, whether the template is detached, the clone
count, and every child of the container with its text, its inline transform and its `dy`
(text top minus row top — should be ~0). That output is what proved the DOM was correct and
turned a structural hunt into a CSS one. `?fcdebug` (ENTERS row + the reveal copy tracer)
is still there, described in ARCHITECTURE.md § transition.js.

**Waiting on the backend (no frontend work pending):**
- The dev is generating the missing **with/without-cover image pairs**. Only 19 of 90
  avatar slots were selectable on 2026-08-21 (black/male 9/9, black/female 9/9,
  coloured/female 1/9); a slot becomes selectable the moment its pair is approved, with
  no republish needed. Re-measure with the loop in `AVATAR-BACKEND-QUESTIONS.md`.
- Still unanswered there: Q6 (is `AvatarRace` final?), Q7 (rate limits on `/avatars`),
  Q8 (does the avatar `PATCH` write the session's `gender`?). None blocking.

**Known pre-go-live tasks:**
- The API base in `flexicare-core.js` is still **staging**
  (`api-staging-discovery.injozitech.com`).
- Remove `data-reveal-debug` from `[data-reveal]` — presence alone turns on console logging.

**Open COPY item (needs a person, not code):** the `C:CORE` block in
`docs/product-copy-embed.html` is a flagged PLACEHOLDER. The C10 design shows PLUS only,
but the API can still return `CORE` for archetype C because `product` comes from
`tier_score`. Also missing from the source design: any `tell-more-*` copy for archetype A.

**Open Webflow-side items:**
- `/flexicare-product`: the per-archetype framing line ("Based on your family —") varies by
  archetype and is NOT in the API, so it needs three static blocks gated by
  `data-product-for="A"` / `"B"` / `"C"`. Same for the "Tell me more" copy.
- `/flexicare-product`: `data-product-next` — the CTA target. The design moved away from
  WhatsApp; whatever the destination is, it is a plain URL and a normal `barba.go()`.
- Reveal page: `data-reveal-copy-state` must be exactly `loading` (it was `Loading...`);
  `data-reveal-timeout` is `9000` and should be the `90000` default, or the selfie path
  falls back to the placeholder pair before generation finishes; add the `is-0` combo class
  to the four copy slots with `data-reveal-skeleton-target` on their WRAPPERS. `is-0` and
  `data-anim` must not share an element — GSAP writes inline opacity and inline beats a class.

**Only tested as archetype A + CORE.** Worth a run through as B and C to confirm the
per-archetype copy switches.

**Next up:** the phase after the product page (fresh session).

---

## 2026-08-25 — The real cause: clones inherited a mid-tween transform
- `src/flexicare-product.js`, `ARCHITECTURE.md`
- `debugList()` proved the DOM was correct — 4 clones, template detached, no stray row — and
  the page still looked like the text was shifted one row down. It was never structural.
- transition.js animates `[data-anim]` elements in from an offset: gsap writes
  `transform: translate(0,Npx)` and `opacity:0` INLINE, then clears both when the tween
  finishes. Clones are built during `afterEnter`, while that tween is still running, so they
  are born holding a mid-flight transform — and the tween that would clear it is pointed at
  the template, which by then is detached. Nothing ever clears the clones.
- Why it read as an off-by-one: `check-wrapper` has no `data-anim`, so the icon stayed put
  while the text element inside the same row was pushed down ~one row height. Icons and text
  then looked interleaved, with an orphan icon at the top and an orphan line at the bottom.
- `unhide()` now calls `clearInlineMotion()` across the whole subtree (not just elements that
  still carry an entrance attribute — the transform is on the element whether or not the
  attribute survived), and the pristine template is cleaned at capture time so no page ever
  renders rows from a frozen copy. INLINE properties only; Webflow class styling is untouched.
- `debugList()` now prints `dy` (text top minus row top) and the inline transform per row.
  `dy` should be ~0; a row height means this bug is back.

## 2026-08-25 — Detach the list template instead of hiding it
- `src/flexicare-product.js`, `ARCHITECTURE.md`
- Third attempt at the same symptom, and this time by removing the failure mode rather than
  patching it. The authored template row kept rendering as an empty row above the real ones,
  which reads as the text being shifted down by one.
- Hiding it failed twice, in two different ways: an inline `display:none` loses to a Webflow
  class carrying `!important`, and an attribute rule with our own `!important` gets inherited
  by the clones — they are made FROM the template — and hid the entire list.
- `resolveList()` now keeps a pristine detached `cloneNode(true)` in `state.lists[slot]` and
  REMOVES the original from the DOM the first time it resolves the list; every paint clones
  from the detached copy. A detached node cannot render whatever any stylesheet says. The
  cache is keyed per slot, holds the container too (so the swapped-attribute recovery still
  re-resolves after the marked element is removed), and is cleared on init and teardown, so
  each Barba arrival picks up the fresh container's authored template.
- `clearSkeleton()` removes, rather than hides, the template of a list whose slot got no copy.
- `debugList()` now reports the template as `detached (ok)` / `in the DOM but hidden` /
  `*** STILL IN THE DOM AND VISIBLE ***`, which is the distinction that mattered here.

## 2026-08-25 — Fix: clones inherited the template's hide attribute
- `src/flexicare-product.js`
- Regression from the commit before this one. The template is hidden by attribute
  (`data-product-template-hidden` → `display:none!important`), and clones are made FROM the
  template, so every clone inherited it and the whole list vanished. `debugList()` showed it
  exactly: 4 clones, all `HIDDEN`. Clones now strip that attribute and its `aria-hidden`.
- Also confirmed by that output: the earlier five-rows-with-shifted-text symptom WAS the
  authored template surviving as a visible empty row (`0. div.product-list-item [authored]`).
  The attribute-based hiding fixed the cause; this fixes the overshoot.
- `renderList()` now warns if it builds rows that end up invisible, naming the computed
  `display`/`visibility` and pointing at `debugList()`. A silently empty card looks like
  "the copy didn't load" and sends you hunting in the wrong place — this was that.

## 2026-08-25 — Harden the list-template hiding, add a list diagnostic
- `src/flexicare-product.js`
- Reported symptom: five rows for four items, checks on rows 1-4 and text on rows 2-5 — an
  authored template row surviving at the top, which reads as the text being shifted down one.
- The template was hidden with an INLINE `display:none`, which loses to any Webflow class
  carrying `!important`. Now hidden by attribute (`data-product-template-hidden`) with a
  matching `display:none!important` in the injected stylesheet, plus `aria-hidden`. Both
  the render path and the no-copy path in `clearSkeleton()` go through `hideTemplate()`.
- NEW `Flexicare.product.debugList("plan-benefit")` — prints the resolved container and
  template, whether the template is still visible, the clone count, and then EVERY direct
  child of the container in order with its text and whether it is a clone or authored. An
  off-by-one row shows up immediately as an unexpected `[authored]` entry.

## 2026-08-25 — Cloned benefit rows rendered their icons but no text
- `src/flexicare-product.js`, `ARCHITECTURE.md`
- With the list attributes the right way round, the rows cloned correctly — four rows, four
  check icons, and no words.
- TWO rules hide authored content until its entrance animation runs:
  `.lg-anim [data-anim]:not([data-text-reveal]){opacity:0}` (transition.js) and
  `.tr-ready [data-text-reveal]{visibility:hidden}` (text-reveal.js). A clone inherits
  both, and clones are built during `afterEnter` — AFTER both animations have already run —
  so nothing ever comes along to reveal them.
- The strip was only running on the clone's ROOT. The attribute is normally on the TEXT
  element INSIDE the row, so the row was revealed and its words were not.
- New `unhide(root)` sweeps the root and every descendant carrying `data-anim`,
  `-anim-fade`, `-text-reveal` or `-product-skeleton`, clearing the attribute, the inline
  `visibility` text-reveal may already have set, and opacity. Used by both clone paths, and
  on the ORIGINAL row in the in-place path (it holds item 0 and is authored content).
  Deliberately NOT a blanket "un-hide everything inline-hidden in this row" — that would
  also reveal whatever the template hides on purpose.
- No Webflow change needed.

## 2026-08-25 — Recover from swapped list attributes on the product page
- `src/flexicare-product.js`, `ARCHITECTURE.md`
- The benefit list came out "completely wrong" on the live page because the two list
  attributes were the wrong way round in the Designer: `data-product-list-template` on the
  WRAPPER and `data-product-list="plan-benefit"` on the item inside it.
- **Why that symptom looks unrelated to that cause:** with the attributes swapped the
  template is an ANCESTOR of the container, so `one("[data-product-list-template]", box)`
  finds nothing, the slot falls through to the ID path, and the TEXT element gets cloned as
  siblings *inside* the row — laid out along the row's flex axis, and with no check icon on
  any clone, because the icon lives in the row that wasn't cloned.
- `resolveList()` now detects the inversion (and both attributes on one element), renders
  it the way the author meant, and warns in the console with exactly what to change. The
  contract is unchanged and still the thing to fix: container OUTSIDE, template INSIDE.
- Clones are now stripped of `data-product-list` as well as `-list-template`; in the
  swapped case the template carries the list attribute, and a clone that kept it would be
  picked up as the container by the next paint.
- Anything else inside the template (a check-wrapper, an arrow) is cloned untouched — that
  is how every row gets its own icon, with no extra attributes.

## 2026-08-24 — Product benefit lines: list them all, don't cycle them
- `src/flexicare-product.js`, `ARCHITECTURE.md`
- The benefit lines were animating one at a time. A multi-item slot landing on ONE element
  fell through to the CYCLE branch — the right behaviour for a rotating strapline and the
  wrong one for a set of benefits that are all meant to be read at once.
- **Multi-item slots now LIST by default.** With one element and several items, that
  element is itself cloned in place, once per item, as siblings after itself. So the plain
  Webflow build needs no wrapper: put the ID on the benefit row and five items give five
  rows. `[data-product-list]` + `[data-product-list-template]` is still there and still
  preferred when the row markup is elaborate.
- **`[data-product-row]`** — put it on an ancestor when the ID sits on the text element and
  the arrow glyph is a SIBLING; that ancestor is what gets cloned, so the arrows survive.
  Without it, cloning the text alone gives text with no arrows.
- Clones keep the ID off (duplicate IDs are invalid and would send the next paint down the
  one-item-per-element branch), strip the entrance attributes, and get a glass re-scan.
- **Cycling is now opt-in: `data-product-cycle-slot` on the element.**
- No Webflow change needed for the benefit lines to start listing. If the arrow glyph
  vanishes from the cloned rows, add `data-product-row` to the row.

## 2026-08-24 — Trim the product embed to the two slots that need it
- `docs/product-copy-embed.html`, `ARCHITECTURE.md`
- The embed now carries ONLY `plan-heading` and `plan-benefit` — the copy that genuinely
  varies on both axes. Dropped `framing-lead`, `framing-sub`, `plan-eyebrow`,
  `tell-more-intro` and `tell-more-note`: the first is static text plus
  `[data-product-name]`, the eyebrow is `product_label` via `[data-product-label]`, and the
  rest are better as static Webflow blocks. Six pair blocks plus a `*` fallback, verified
  across all six combinations.
- **The one thing that moved rather than disappeared:** `framing-sub`
  ("Based on your family —") varies per ARCHETYPE and is NOT in the API, so it can't be
  plain static text. Build the three variants in Webflow and gate them with
  `data-product-for="A"` / `"B"` / `"C"` — the script hides the two that don't match.
  Same for the "Tell me more" copy.
- No script change; the controller reads whatever slots the embed defines.

## 2026-08-24 — Product page: the authored copy, a list template, and copy tokens
- `src/flexicare-product.js`, NEW `docs/product-copy-embed.html`, `ARCHITECTURE.md`
- **`docs/product-copy-embed.html`** is the paste-ready copy database, transcribed from the
  A10/B10/C10 recommendation designs: one block per archetype x product plus a `*`
  fallback, using single-axis keys where the copy only varies on one axis (`framing-sub` is
  per-archetype; `plan-eyebrow` is per-product). Verified by replaying the resolution rules
  over the file for all six combinations.
  - TWO GAPS IN THE SOURCE DESIGN, flagged in comments rather than papered over: C10 shows
    PLUS only, so **C:CORE copy is my placeholder and needs a copywriter** (the API can
    still return CORE for C — product comes from `tier_score`); and A10's "Tell me more"
    slide wasn't supplied, so archetype A has no `tell-more-*` copy.
  - Caught while verifying: C's `tell-more-intro` named "Flexicare Plus", which C:CORE
    inherited from the archetype-only block. Plan-naming copy has to be keyed per pair.
- **List templates.** `[data-product-list="plan-benefit"]` + ONE
  `[data-product-list-template]` inside it: the script clones the template per copy entry,
  so a 4-line list for A and a 5-line list for C:PLUS need no extra Webflow work. Clones
  strip `data-anim`/`-anim-fade`/`-text-reveal` (the FOUC rule would otherwise leave them
  invisible — the bug the quiz's option clones already hit) and glass is re-scanned.
  `[data-product-list-text]` is the text slot, so the item's arrow glyph is never
  overwritten. A list whose slot has no copy gets its template hidden rather than left
  showing one placeholder bullet.
- **Copy tokens.** `{name}` `{price}` `{amount}` `{product}` `{archetype}` `{echo}` are
  substituted into every slot, so the embed can carry "Your Flex, {name}." as one sentence.
  A token resolving to nothing eats one comma/space run before it, so a missing name gives
  "Your Flex." not "Your Flex, ." Unknown tokens are left visible.
- No Webflow footer change (the file list is unchanged since the last entry).
- **WEBFLOW:** build ONE benefit row, mark it `[data-product-list-template]`, wrap it in
  `[data-product-list="plan-benefit"]`, and put `[data-product-list-text]` on its text
  element (the arrow belongs in a sibling). IDs needed on the copy slots: `framing-lead`,
  `framing-sub`, `plan-eyebrow`, `plan-heading`, `tell-more-intro`, `tell-more-note`.

## 2026-08-24 — NEW `/flexicare-product`: the recommendation page
- NEW `src/flexicare-product.js`; `src/flexicare-quiz.js`, `ARCHITECTURE.md`, `CLAUDE.md`,
  `docs/hosting-and-publishing.md`
- The last beat of the funnel. Renders the plan the server picked out of ONE object —
  `Flexicare.result`, the `POST /sessions/{id}/finish` response the FLEX quiz already
  stashed — so on a `barba.go()` arrival the page paints in the same frame. No polling,
  no generation step. Hard reload / deep link re-reads `GET /sessions/{id}`; a session
  that isn't `COMPLETED` bounces to `data-product-quiz` (default `/flexicare`) instead of
  rendering an empty plan.
- **The copy embed is keyed on BOTH axes**, archetype AND product, because the plan copy
  differs per combination (six variants of every card). `data-copy-for="A:PLUS"`; either
  half may be `*`; a bare token is read from its own vocabulary (`A/B/C` archetypes,
  `CORE/PLUS` products) so `"A"` = `"A:*"` and `"PLUS"` = `"*:PLUS"`. More specific wins
  slot by slot on the ladder `*` → product → archetype → pair, replacing rather than
  merging. A typo'd token matches nothing rather than acting as a wildcard.
- Repeated slot names do double duty: N items across N elements = a list (the design's
  three benefit lines), N items into ONE element = a cycle.
- `recommended_price_cents` is in CENTS and may be `null` — divided by 100, formatted with
  `data-product-price-format="From R{amount}/month"`, and the slot is HIDDEN when the API
  returns no price rather than printing `R0`.
- `src/flexicare-quiz.js`: the FLEX `data-quiz-done` default is now `/flexicare-product`
  (was the never-built `/results`).
- **WEBFLOW — the file list CHANGED, so the footer needs the new line** (after
  `flexicare-reveal.js`, before the dev tuners):
  `<script src="https://flexicare.kenton-323.workers.dev/src/flexicare-product.js"></script>`
- **WEBFLOW — on the new page**, inside `data-barba="container"`: `[data-product]` on the
  container, `data-product-next="<spin-to-win slug>"` (the `/spin-to-win` fallback warns in
  the console), a `[data-product-copy]` HTML Embed of `[data-copy-for]` blocks, Webflow IDs
  on the copy slots, and `[data-product-label]` / `[data-product-price]` /
  `[data-product-name]` on the API-driven bits. Shell STRUCTURE must match the other pages.

## 2026-08-24 — Route the reveal CTA to the new FLEX quiz page, `/flexicare`
- `src/flexicare-reveal.js`, `src/flexicare-quiz.js` (docs), `ARCHITECTURE.md`, `CLAUDE.md`
- `data-reveal-next` now defaults to **`/flexicare`** instead of the never-built `/flex`,
  so the reveal CTA lands on the FLEX quiz without needing the attribute set by hand.
- No renderer changes: `flexicare-quiz.js` already supports the FLEX stage
  (`data-quiz-stage="FLEX"`, archetype filter, `ensureArchetype()` recovery,
  `POST /sessions/{id}/finish`). `/flexicare` is a Webflow **duplicate of `/archetype`** —
  same structure, same element hooks, different `[data-quiz]` config. Nothing to add to
  the footer: the file list is unchanged.
- **Webflow side — on the duplicated `/flexicare` page's `[data-quiz]` wrapper:**
  - `data-quiz-stage="FLEX"` (required — without it the page re-runs the routing quiz)
  - `data-quiz-back="/meet-your-two-selves"` (else Back on question 1 exits to
    `/onboarding`)
  - `data-quiz-done="<the page after FLEX>"` (falls back to `/results`)
  - `data-quiz-routing="/archetype"` (default; the bounce if the archetype is unrecoverable)
  - `data-quiz-progress-start` / `-end` for this stage's slice of the global bar, and
    `data-progress` on the container
  - `data-quiz-next-text-last` — the routing page's "See your 2 selves" is wrong here
  - keep the shell STRUCTURE identical to the other pages (only classes may differ)

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
