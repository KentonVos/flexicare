# `/spin-to-win` — the complete attribute reference

Every attribute `flexicare-spin.js` reads or writes. Checked against the source.

Companion files:
- `demo/spin-webflow-structure.html` — the same thing as markup you can copy
- `demo/spin-webflow-embed.html` — the CSS to paste into the page head
- `docs/kiosk-and-spin.md` — why any of it works the way it does

---

## 1. The gate

| Attribute | |
|---|---|
| `[data-spin]` | **REQUIRED.** Marks the page and holds every config attribute below. No `[data-spin]`, no init, blank page. Must live inside `data-barba="container"`. |

Everything in §2–§5 goes **on this element**.

---

## 2. Behaviour

| Attribute | Default | Range | |
|---|---|---|---|
| `data-spin-product` | `/flexicare-product` | | Bounce target when the session isn't `COMPLETED`. |
| `data-spin-onboarding` | `/onboarding` | | Bounce target when there's no session id. |
| `data-spin-nav-hide` | `on` | Whether tapping spin collapses the nav wrapper. The spin CTA lives in the nav, so once the wheel turns the nav is spent: it slides away with the **same gesture the landing page uses** (`PageTransition.nav`, so it needs `[data-nav-reveal]` on the wrapper) and stays away, because the next step is going home where it is collapsed anyway. It returns only if the state goes back to `ready` — the spin didn't take — since otherwise the shopper is left with a wheel they can't tap. `off` disables. |
| `data-spin-expires-format` | `Claim by {date}` | | `{date}` is replaced with the localised date. |
| `data-spin-debug` | absent | flag | Console logging **and the layout audit**. Turn it on while building. |

---

## 3. The spin animation

**One gesture.** Tap → the server is asked where to land → the wheel winds up and
settles in a single ease-in-out. That's the whole animation.

| Attribute | Default | Range | |
|---|---|---|---|
| `data-spin-duration` | `3` | ≥ 0.3 | Seconds of the **whole motion**, wind-up and settle together. |
| `data-spin-ease` | `power2.inOut` | any GSAP ease | The curve of that motion. `power1.inOut` is gentler, `power3.inOut` snappier. |
| `data-spin-turns` | `3` | ≥ 0 | Full rotations before landing. More turns over the same duration = faster peak. |
| `data-spin-pointer-angle` | `0` | 0–359 | Where the marker sits, **degrees clockwise from 12 o'clock**. Published back as the CSS variable `--fc-pointer-angle` — position the visible marker with that, never by hand. |

`prefers-reduced-motion` is respected automatically: the wheel snaps instead of spinning.

### The slow-response fallback

A single speed-up-and-slow-down has to know where it ends before it starts, so the
wheel doesn't move until the server answers. That's a few hundred milliseconds
normally — but not always, on store wifi.

So after `data-spin-wait` the wheel starts turning anyway rather than sitting frozen,
and the landing then *decelerates* instead of easing in again (easing in from a
moving wheel would brake it to a stop first — a visible hitch).

| Attribute | Default | Range | |
|---|---|---|---|
| `data-spin-wait` | `0.4` | ≥ 0 | Seconds to wait for the API before spinning anyway. Raise it to make the fallback rarer, lower it to make a frozen wheel less likely. |
| `data-spin-idle-turn` | `1` | ≥ 0.4 | Seconds per rotation during that fallback spin. |
| `data-spin-min` | `2` | ≥ 0 | **Fallback only.** Once the wheel is turning, keep it turning at least this long before decelerating, so a late answer doesn't cut it short. Ignored on the normal path. |
| `data-spin-ease-out` | `power4.out` | any GSAP ease | The deceleration curve used on that path. |

None of these fire when the API is quick, which is the normal case.

---

## 4. The wheel — styling

All lengths are in **viewBox units**, where the wheel's radius is `96` out of a
200×200 box. They scale with the stage, so a value here means the same thing at any
size.

### Style and fills

| Attribute | Default | Range | |
|---|---|---|---|
| `data-spin-style` | `glass` | `glass` \| `solid` | `glass`: translucent panes, colour comes from behind. `solid`: fills each segment with the admin's `color` from the API. |
| `data-spin-fill` | `rgba(255,255,255,0.06)` | any CSS colour | Pane A (even segments). |
| `data-spin-fill-alt` | `rgba(255,255,255,0.025)` | any CSS colour | Pane B (odd segments, and the last one when the count is odd). |
| `data-spin-tint` | `0` | 0–1 | How much of the API's per-segment `color` to blend in. `0` = pure glass. |

### Pane glass — what makes each segment read as its own piece

| Attribute | Default | Range | |
|---|---|---|---|
| `data-spin-edge` | `1` | 0–1 | Brightness of the lit hairline down each pane's leading radial edge. Fades out toward the hub. `0` = off. |
| `data-spin-edge-width` | `0.2` | 0.1–4 | |
| `data-spin-edge-color` | `#ffffff` | | |
| `data-spin-sheen` | `0.48` | 0–1 | A specular overlay across the disc that **does not rotate** with the wheel. This is the single biggest contributor to the glass read — fixed light over a turning object. `0` = off. |
| `data-spin-light-angle` | `40` | 0–359 | Where that light comes from, degrees clockwise from 12. |
| `data-spin-hub-radius` | 24% of the segment radius | | Where the lit edges fade out. Keep it under your dial so they don't poke out. |

The real blur is **CSS**, not an attribute: `backdrop-filter` on `[data-spin-wheel]`
in the embed. It can't be an attribute because `backdrop-filter` cannot be applied
to an SVG shape.

### Dividers, rim and studs

| Attribute | Default | Range | |
|---|---|---|---|
| `data-spin-stroke-width` | `0` | 0–10 | Hard divider between segments. Off by default — the lit edges usually read better. |
| `data-spin-stroke` | `rgba(255,255,255,0.4)` | | Divider colour. |
| `data-spin-rim` | `0` | 0–86 | Width of an outer ring band. The segments stop below it. `0` = no rim. |
| `data-spin-rim-stroke` | `rgba(255,255,255,0.28)` | | The two hairline circles bounding the band. |
| `data-spin-rim-width` | `0.6` | 0–6 | Their thickness. |
| `data-spin-studs` | `off` | `on` \| `off` | A pearl stud at every segment boundary, in the rim band. Needs `data-spin-rim` > 0. |
| `data-spin-stud-size` | `0.5` | 0.1–10 | |
| `data-spin-stud-fill` | `#ffffff` | | |

### Labels

| Attribute | Default | Range | |
|---|---|---|---|
| `data-spin-labels` | `on` | `on` \| `off` | |
| `data-spin-label-mode` | `radial` | `radial` \| `tangential` | `radial` reads outward from the hub and gets the full radius — what long prize names need. Labels on the left half flip automatically so nothing is upside down. |
| `data-spin-label-size` | `4.5` | 2–30 | |
| `data-spin-label-radius` | `87` | 10–96 | Where the label's outer end sits. **Clamped** inside the segment radius, so a label can never run out under the studs. |
| `data-spin-label-color` | `#ffffff` | | |

Font family, weight and letter-spacing come from CSS — `[data-spin-label]` in the
embed. They're SVG text nodes, so the Designer can't reach them.

### Icons

| Attribute | Default | Range | |
|---|---|---|---|
| `data-spin-icons` | `off` | `on` \| `off` | Draws each segment's `image_url` from the API, when an admin has uploaded one. |
| `data-spin-icon-size` | `22` | 4–80 | |
| `data-spin-icon-radius` | `42` | 0–segment radius | Distance from the centre. |

---

## 5. Structure — the elements

### The wheel

| Attribute | | |
|---|---|---|
| `[data-spin-stage]` | **REQUIRED** | The square container. Give it a **width**; the embed supplies `position:relative` and `aspect-ratio:1/1`. **Never put a `filter` on it.** |
| `[data-spin-wheel]` | **REQUIRED** | The canvas. **Leave it empty** — cleared on every render. |
| `[data-spin-hub]` | optional | Your dial. Position it yourself; the embed adds the second blur. |
| `[data-spin-marker]` | optional | Full-size wrapper that rotates to `--fc-pointer-angle`. |
| `[data-spin-pointer]` | optional | Your graphic, inside the marker, at top centre. **The embed does not style it** — an empty div is invisible. |
| `[data-spin-glow]` | optional | Your colour layer. Must be a **sibling** of the wheel, never a parent. |

### Panels

`[data-spin-when="..."]` — shown only in the listed states. Space-separated for
"any of these".

| Value | When |
|---|---|
| `loading` | Resolving the session and the wheel. |
| `form` | The lead form must be completed before the wheel unlocks. |
| `ready` | Wheel drawn, CTA live. |
| `spinning` | Turning; CTA disabled. |
| `prize` | Won a real prize. |
| `consolation` | The "try again" segment. **No claim code here.** |
| `redeemed` | Staff already handed it over. |
| `expired` | The claim code lapsed. |
| `voided` | An admin cancelled it. |
| `nophone` | No phone number on the session. |
| `unavailable` | Web session, wheel down, already spun… |
| `error` | Anything unexpected. |

The state is also written to `data-spin-state` on `[data-spin]` **and** on `<html>`,
so a full-bleed background can react to it.

### The lead form (state `form`)

A gate in front of the wheel. Put all of it inside a `[data-spin-when="form"]`
panel; the wheel is already rendered behind it, so submitting only flips the
state. On success the state goes to `ready` and the gate is remembered for that
session in `sessionStorage`, so a reload does not re-ask.

| Attribute | | |
|---|---|---|
| `[data-spin-lead-name]` | required | `<input>`. Prefilled from `session.first_name`. |
| `[data-spin-lead-surname]` | required | `<input>`. |
| `[data-spin-lead-phone]` | required | `<input>`. Prefilled from `session.phone_number`; normalised to E.164 before sending. |
| `[data-spin-lead-email]` | required | `<input>`. Prefilled from `session.email`. |
| `[data-spin-lead-idtype]` | required | On **both** options, valued `id` / `passport`. Clicks are delegated, so a styled div works as well as a radio. Gets `aria-checked`; the wrapper gets `data-spin-lead-type`. |
| `[data-spin-lead-idnumber]` | required | `<input>`. 13 digits for `id`, 6–20 alphanumerics for `passport`. |
| `[data-spin-lead-submit]` | required | The button. `aria-disabled` while in flight. |
| `[data-spin-lead-error]` | optional | Message box, written as TEXT, hidden when empty. |
| `[data-spin-lead-idlabel]` | optional | Its text follows the chosen type. |

> **Only phone and email reach the backend.** They have real endpoints
> (`PATCH …/contact/phone` and `…/contact/email`). `name`, `surname`, `id_type`
> and `id_number` have **no endpoint in the API contract** — they are buffered
> on `Flexicare.lead` in memory and are lost on a hard reload. Deliberate and
> temporary: the form was built ahead of the backend. When the endpoints land,
> `submitLead()` in `flexicare-spin.js` is the one function to change.

Build it with `?spindemo=form`.

#### Panel motion

The swap between panels is animated — the outgoing one scales and fades out, the
incoming one scales and fades in. Configured on `[data-spin]`:

| Attribute | Default | |
|---|---|---|
| `data-spin-panel-in` | `0.45` | Seconds, the entrance. |
| `data-spin-panel-out` | `0.28` | Seconds, the exit. |
| `data-spin-panel-overlap` | `0` | Seconds the entrance starts **before** the exit ends. `0` is sequential — the safe default when panels are siblings in normal flow. Raise it for a cross-fade only once the panels are **stacked** (one grid cell, or absolutely positioned); otherwise both are in the layout for that overlap and the page jumps. |
| `data-spin-panel-scale` | `0.94` | The entrance starts here, the exit ends here. |
| `data-spin-panel-scale-out` | = `-panel-scale` | Override for the exit only. |
| `data-spin-panel-ease` | `power2.out` | Entrance ease. |
| `data-spin-panel-ease-out` | `power2.in` | Exit ease. |

Skipped entirely under `prefers-reduced-motion`, and on the **first** paint of the
page — there is nothing to cross-fade from, and it would fight the Barba entrance.

Two rules the markup has to respect:

- **A panel that is also a glass host fades without scaling.** Glass owns
  `transform`, and its press spring resets to the transform captured at attach,
  which would wipe a scale tween. The console warns once. To get the scale, make
  the panel a plain wrapper and put `data-liquid-glass` on the card inside it —
  scaling a wrapper is safe, since an affine deform transforms the finished glass
  rendering, rim and displacement map as one unit.
- **Nested panels don't animate when their parent panel is also changing.** The
  message card lists six states and each block inside it lists one, so landing on
  `consolation` changes both; the outermost carries the motion or the fades
  multiply. A block whose parent is staying put (`redeemed` → `expired` inside
  the same card) still animates.

`data-spin-reason` narrows `unavailable`: `web`, `wheel`, `already-spun`,
`other-kiosk`, `disabled`, `rate-limit`, `network`, `unknown`.

### Content slots

Written as **text**, never HTML — every string comes from the API.

| Attribute | |
|---|---|
| `[data-spin-name]` | The shopper's first name. |
| `[data-spin-name-wrap]` | Hidden when there's no name, so the greeting reads cleanly without one. |
| `[data-spin-prize-name]` | Full prize name ("Flexicare water bottle"). |
| `[data-spin-prize-label]` | Short on-wheel copy ("Water bottle"). |
| `[data-spin-claim]` | The claim code. **Large and high-contrast** — staff read it off the tablet. Left empty on a consolation award and on any award that's no longer claimable. |
| `[data-spin-claim-wrap]` | Hidden whenever there's no code to emphasise. |
| `[data-spin-instructions]` | Redemption copy. The API may send `null` — **your authored copy is the fallback**, so write something real. |
| `[data-spin-expires]` | Formatted via `data-spin-expires-format`. |
| `[data-spin-expires-wrap]` | Hidden when the award never expires. |
| `[data-spin-store]` | The store to collect from. |
| `[data-spin-error]` | Fallback message. Its authored text is the default, so write something real here too. The 429 cooldown countdown is written here **while the state is still `ready`**, so a second slot inside the `ready spinning` panel is what makes it visible. |
| `[data-spin-error-copy]` | Supplies an `[data-spin-error]` element's fallback text *without* rendering it. Use it on the empty second slot: `showError()` takes its default from the FIRST error slot in document order, and the wheel panel precedes the result cards, so an empty slot there would otherwise override your authored copy with the script's hard-coded string. |

### Buttons

| Attribute | |
|---|---|
| `[data-spin-go]` | **REQUIRED.** The spin button. The script sets `disabled` / `aria-disabled`. It does **not** have to be inside the stage, or even inside `[data-spin]` — clicks are delegated from `document`, so a button in a nav bar works, including one in the persistent shell outside `data-barba="container"`. |
| `[data-spin-done]` | A "finish" link. Its own value or `href` is the target; falls back to `/`. |
| `[data-spin-back]` | A "go back" link. Its own value or `href`; falls back to `history.back()`. |

---

## 6. Written by the script (don't author these)

On the wrapper: `data-spin-state`, `data-spin-reason`, `data-spin-demo`, and the CSS
variable `--fc-pointer-angle`.

On the injected SVG, useful as CSS hooks:

| | |
|---|---|
| `[data-spin-svg]` | The `<svg>` itself. |
| `[data-spin-rotor]` | The two rotating groups (panes behind, content in front). |
| `[data-spin-segment="0"]` | Each pane, by index. |
| `[data-spin-consolation]` | On the consolation pane. |
| `[data-spin-label="0"]` | Each label. |
| `[data-spin-edge-line="0"]` | Each lit edge. |
| `[data-spin-sheen-layer]` | The fixed specular overlay. |
| `[data-spin-ring]`, `[data-spin-stud="0"]`, `[data-spin-icon="0"]` | Rim, studs, icons. |

Note these are deliberately **not** the same names as the config attributes, so
`[data-spin-sheen-layer] {}` in your CSS can't accidentally select the wrapper.

---

## 7. Kiosk attributes for this page

| Attribute | |
|---|---|
| `data-kiosk-idle-factor="2"` | Multiplies the kiosk idle timeout on this page. **Put this here** — a shopper reading or photographing a claim code shouldn't lose it at 90 seconds. |
| `data-kiosk-screen="spin"` | What the heartbeat reports. Optional; the script guesses from the URL otherwise. |

---

## 8. The tuned starting point

```html
<div data-spin
  data-spin-product="/flexicare-product"
  data-spin-onboarding="/onboarding"
  data-spin-turns="3"
  data-spin-duration="3"
  data-spin-ease="power2.inOut"
  data-spin-pointer-angle="0"
  data-spin-style="glass"
  data-spin-tint="0"
  data-spin-fill="rgba(255,255,255,0.06)"
  data-spin-fill-alt="rgba(255,255,255,0.025)"
  data-spin-rim="0"
  data-spin-studs="off"
  data-spin-stud-size="0.5"
  data-spin-edge="1"
  data-spin-edge-width="0.2"
  data-spin-sheen="0.48"
  data-spin-light-angle="40"
  data-spin-labels="on"
  data-spin-label-mode="radial"
  data-spin-label-size="4.5"
  data-spin-label-radius="87"
  data-spin-label-color="#ffffff"
  data-spin-stroke-width="0"
  data-spin-expires-format="Claim by {date}">
```

Almost all of these are already the script's defaults — a bare `[data-spin]` lands
on this look. The two genuinely worth setting are `data-spin-product` and
`data-spin-onboarding`, which have no sensible default for your URL structure.

Tune any of it live at
`https://flexicare.kenton-323.workers.dev/demo/spin?spindemo` — the panel writes
these attributes and hands back a paste-ready block.
