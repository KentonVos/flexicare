# Kiosk mode + the prize wheel — how to build it in Webflow

Covers the two new scripts, `src/flexicare-kiosk.js` and `src/flexicare-spin.js`,
and exactly what has to exist in the Designer for them to work.

Read `docs/api-contract.md` §6 and §7 for the backend side. This document is the
**Webflow** side.

---

## 1. The one thing to understand first

**The spin is kiosk-only, and that is decided at the START of the funnel, not at
the end.**

`POST /sessions/{id}/spin` refuses any session whose `channel` is `WEB`. A session
only becomes `KIOSK` if the `X-Kiosk-Token` header was present on `POST /sessions`
— which happens on **/onboarding**, five pages earlier.

So the chain is:

```
tablet paired once  →  device token in localStorage
                       ↓
/onboarding  POST /sessions  + X-Kiosk-Token   →  channel: "KIOSK"
                       ↓
… quiz … reveal … product …
                       ↓
/spin-to-win  POST /sessions/{id}/spin + X-Kiosk-Token  →  the prize
```

Break any link and the shopper completes the whole journey only to be told at the
wheel that they cannot spin. If you are testing the spin page and it keeps showing
"unavailable", the answer is almost always that the session was started on an
unpaired browser.

On the public site none of this fires: no token, no header, `channel: "WEB"`, and
the kiosk script sits inert. That is the intended behaviour, not a fallback.

---

## 2. Recommended way to build the wheel

**Short version: Webflow supplies an empty square box; the script draws the wheel
into it as SVG. Everything else around the wheel — pointer, hub, rim, glow, the
button — is normal Webflow layout stacked on top.**

### Why the wheel itself cannot be built in the Designer

The segments are **admin data**. `GET /prizes/wheel` returns the count, the order,
the labels and the hex colours, and an admin can change any of them without a
deploy. Seven segments today is not a promise. A wheel hand-built as seven rotated
divs is wrong the first time someone adds a prize — silently, in store.

So the division of labour is:

| Owned by Webflow (you) | Owned by `flexicare-spin.js` |
|---|---|
| The stage box, sized and centred | The `<svg>` inside it |
| The pointer, absolutely positioned | Segment paths, fills, labels, icons |
| The hub / centre cap | The rotation, the deceleration, the landing |
| Rim, shadow, glow, glass | Nothing outside `[data-spin-wheel]` |
| The spin button and every panel of copy | Which panel is visible |

### The structure to build

```
Wheel Stage            .spin-stage       position: relative; width: 78vmin;
                                         max-width: 560px; aspect-ratio: 1 / 1;
├── Wheel Canvas       [data-spin-wheel] position: absolute; inset: 0;
│                                        ← LEAVE THIS EMPTY. The script clears it.
├── Hub                .spin-hub         position: absolute; centred; border-radius: 50%;
└── Pointer            [data-spin-pointer] position: absolute; top: -2%;
                                         left: 50%; transform: translateX(-50%);
```

Notes that will save you a round trip:

- **The stage must be square.** `aspect-ratio: 1 / 1`, or a fixed equal width and
  height. The SVG fills 100% × 100% of `[data-spin-wheel]` and its `viewBox` is
  square, so a non-square box letterboxes the wheel inside itself and the pointer
  stops lining up.
- **Leave `[data-spin-wheel]` empty in the Designer.** It is emptied on every
  render. Anything you put there — a placeholder image, a Webflow div — is gone.
- **The pointer is decorative.** The script never moves it and never reads its
  position. It reads `data-spin-pointer-angle` instead (degrees clockwise from 12
  o'clock, default `0`). If you style the pointer somewhere other than the top,
  set that attribute to match or the wheel lands on the wrong slice.
- **The hub sits on top** and hides the centre where all the segment points meet.
  Give it a higher z-index than the wheel canvas.
- **No `data-liquid-glass` on the wheel canvas or the stage.** Glass owns
  `transform` and bakes a displacement map from the layout box; a spinning child
  is exactly the case it cannot handle. Put glass on a card *behind* the stage if
  you want the effect. (Glass on the *button* is fine.)

### Sizing and typography of the labels

The labels are drawn as SVG text inside a 200×200 `viewBox`, so sizes are in
viewBox units, not pixels — `data-spin-label-size="7"` is 7/200ths of the wheel's
width, which lands around 19px on a 560px wheel.

Default `data-spin-label-mode="radial"` reads outward from the hub and gives each
label the full radius, which is what "Phone card holder" needs on a seven-slice
wheel. Labels on the left half are flipped automatically so nothing appears upside
down. Switch to `tangential` only if you have very few, very short labels.

To style the text from CSS instead, put an Embed on the page:

```html
<style>
  [data-spin-label] { font-family: inherit; font-weight: 600; letter-spacing: .02em; }
</style>
```

`fill` still comes from `data-spin-label-color` unless your CSS overrides it.

### Icons

Off by default. If your admin has uploaded segment icons, set
`data-spin-icons="on"`. Note the icon URLs are presigned and expire in ~10
minutes — the script fetches the wheel when the spin screen is shown, not at boot,
which is what keeps them fresh.

### Why not conic-gradient or canvas?

- **conic-gradient**: you would still have to build the gradient string from the
  API, and labels become absolutely-positioned rotated divs that need their own
  flip logic. More moving parts for less control, and per-segment icons get ugly.
- **canvas**: crisp enough, but needs devicePixelRatio handling and a redraw on
  every resize, and the labels become invisible to accessibility tooling. On a
  fixed-size kiosk it would work; SVG works everywhere and is less code.

---

## 3. The spin page — `/spin-to-win`

### Page state drives everything

The script writes `data-spin-state` on the `[data-spin]` wrapper **and** on
`<html>`. Every panel on the page declares which states it belongs to:

```html
<div data-spin-when="ready spinning">…the wheel and the button…</div>
<div data-spin-when="prize consolation">…the reward…</div>
<div data-spin-when="unavailable error">…the fallback copy…</div>
```

That is the whole mechanism. One page, no second Barba navigation, and the claim
code can never be lost to a page swap. States:

| State | When |
|---|---|
| `loading` | resolving the session and the wheel |
| `ready` | wheel drawn, button live |
| `spinning` | turning — button disabled |
| `prize` | won a real prize; show the claim code |
| `consolation` | the "try again" segment; **no claim-code emphasis** |
| `redeemed` | staff already handed it over |
| `expired` | the claim code lapsed |
| `voided` | an admin cancelled it |
| `nophone` | no phone number on the session |
| `unavailable` | web session, wheel down, already spun… |
| `error` | anything unexpected |

`data-spin-reason` narrows `unavailable` further: `web`, `wheel`, `already-spun`,
`other-kiosk`, `disabled`, `rate-limit`, `network`, `unknown`. Use it for copy
variants via CSS if you want them:

```html
<style>
  [data-spin-reason="already-spun"] .fc-generic-error { display: none; }
</style>
```

### The structure

```html
<div data-spin
     data-spin-product="/flexicare-product"
     data-spin-onboarding="/onboarding"
     data-spin-turns="6"
     data-spin-duration="4.5"
     data-spin-pointer-angle="0">

  <!-- LOADING -->
  <div data-spin-when="loading"> …skeleton/shimmer… </div>

  <!-- THE WHEEL -->
  <div data-spin-when="ready spinning">
    <div class="spin-stage">
      <div data-spin-wheel></div>
      <div class="spin-hub"></div>
      <div data-spin-pointer></div>
    </div>
    <a href="#" data-spin-go class="btn">Spin</a>
  </div>

  <!-- THE REWARD -->
  <div data-spin-when="prize redeemed expired voided">
    <p><span data-spin-name-wrap>Nice one, <span data-spin-name></span>!</span></p>
    <h2 data-spin-prize-name></h2>
    <div data-spin-claim-wrap>
      <div data-spin-claim class="claim-code"></div>
    </div>
    <p data-spin-instructions>Show this code to a Clicks team member at the till.</p>
    <p data-spin-expires-wrap><span data-spin-expires></span></p>
    <p>Collect at <span data-spin-store></span></p>
    <a href="/" data-spin-done>Done</a>
  </div>

  <!-- CONSOLATION — deliberately no claim code -->
  <div data-spin-when="consolation">
    <h2 data-spin-prize-name></h2>
    <p data-spin-instructions>Thanks for playing!</p>
    <a href="/" data-spin-done>Done</a>
  </div>

  <!-- NO PHONE NUMBER -->
  <div data-spin-when="nophone">
    <p>We need a number to send your reward to.</p>
    <a href="/onboarding" data-spin-back>Add my number</a>
  </div>

  <!-- FALLBACK -->
  <div data-spin-when="unavailable error">
    <p data-spin-error>We couldn't spin the wheel right now — please ask a Clicks team member.</p>
    <a href="/" data-spin-done>Done</a>
  </div>
</div>
```

Make `.claim-code` **large and high-contrast**. Staff read it off the tablet from
a step away, or the shopper photographs it. It is the one piece of copy on the
page with a real-world job.

The authored text inside `[data-spin-instructions]` and `[data-spin-error]` is
kept as the fallback — the API is allowed to send `null` for `instructions`, in
which case your Designer copy stands. So write real copy there, not lorem ipsum.

### Reduced motion

Respected automatically: the wheel snaps to the winning segment instead of
spinning. Nothing to build.

### Full attribute list

At the top of `src/flexicare-spin.js`. Every timing, colour and label knob is a
`data-spin-*` attribute on `[data-spin]`, so you can tune the feel from the
Designer without a push.

---

## 4. Kiosk pairing — the `/kiosk` page

Build this **once**, on a page the public never sees (or as a full-screen overlay
in the persistent shell). It runs an operator through pairing a tablet.

```html
<div data-kiosk-pair data-kiosk-attract="/" data-kiosk-version="1.0.0">

  <div data-kiosk-when="unpaired">
    <h2>This device isn't paired</h2>
    <input data-kiosk-pair-input placeholder="XXXX-XXXX" autocapitalize="characters" />
    <button data-kiosk-pair-submit>Pair</button>
    <p data-kiosk-pair-error></p>
  </div>

  <div data-kiosk-when="pairing"><p>Pairing…</p></div>

  <div data-kiosk-when="active">
    <h2>Paired</h2>
    <p><span data-kiosk-name></span> — <span data-kiosk-store></span></p>
  </div>

  <div data-kiosk-when="disabled">
    <h2>This kiosk is temporarily disabled</h2>
  </div>
</div>
```

The script handles the rest: it upper-cases the input, drops the ambiguous
characters (`I`, `O`, `0`, `1` are not in the alphabet), inserts the dash after
four, enables the button only on a well-formed code, and counts down a `429`
on the button rather than letting the operator hammer it.

**Deep link:** an admin can also open `https://…/kiosk?pair=7K3M-9Q2A` on the
tablet. It pairs automatically and strips the parameter from the address bar
immediately — pairing codes are single-use, and a reload with the code still in
the URL would 404 and look like the pairing had failed.

**Set the font.** Render the code in something where `0/O` and `1/I/l` cannot be
confused. The alphabet already excludes them, but the *claim* codes on the prize
screen use the same alphabet and get read aloud across a shop floor.

### On every other page

Two optional attributes, both on something inside `data-barba="container"`:

- `data-kiosk-screen="quiz"` — what the heartbeat reports to the admin's device
  list. Use `attract`, `quiz`, `photo`, `results`, `spin`, `prize`. Without it the
  script guesses from the URL, which is usually right.
- `data-kiosk-idle-factor="2"` — multiplies the idle timeout on that page.
  **Put this on the spin page.** A shopper reading or photographing a claim code
  must not have it yanked away at 90 seconds.

### Kiosk chrome on the public site

`[data-kiosk-when]` elements are hidden whenever the state is `web` (no token),
so a pairing overlay in the persistent shell stays invisible to web visitors. But
the simplest thing is to keep the pairing UI on its own page.

---

## 5. Product page — sending web visitors somewhere else

The product CTA currently points at `/spin-to-win`. A web visitor who follows it
lands on a page that can only show the fallback copy. Once the site is live to
both audiences, set on `[data-product]`:

```
data-product-next-web="/thank-you"
```

Unpaired devices then go there instead, and tablets still go to the wheel. Leave
it unset and everyone goes to the spin page, which explains itself — fine while
the site is web-only.

---

## 6. The standalone playground — `demo/spin.html`

Before you touch Webflow at all, craft the wheel here. It is a single
self-contained page that loads the **real** `src/flexicare-spin.js`, so whatever
you tune is exactly what the live page will do.

**Locally:**

```bash
cd <this repo>
python3 -m http.server 8080
open http://localhost:8080/demo/spin.html
```

**Or on the deployed preview** — no local server needed:
`https://<branch>-flexicare.kenton-323.workers.dev/demo/spin.html`

It also carries the **structural attributes** the required CSS keys off — none of
which the script reads; they exist so you can name your Webflow classes freely:
`[data-spin-stage]`, `[data-spin-hub]`, `[data-spin-marker]`, `[data-spin-glow]`.

It gives you:

- The full component markup, ready to rebuild in the Designer, with starter CSS
  for the stage, hub, pointer, claim code and every panel.
- A tuner panel writing the `data-spin-*` attributes live. **Animation** knobs
  (turns, landing duration, minimum spin, idle speed, pointer angle) apply to the
  next spin with no reload; **rendering** knobs (label mode/size/radius/colour,
  dividers, labels on/off) redraw the wheel immediately.
- Buttons to jump to any panel — consolation, redeemed, expired, voided, no-phone,
  fallback — so you can style the states you would otherwise never see.
- A **paste-ready attribute block** for the `[data-spin]` element, and a "copy this
  setup as a link" button so a look can be shared or bookmarked (the settings ride
  in the query string and are applied before the controller boots).

The segments come from the live `GET /prizes/wheel`; if it is unreachable you get a
placeholder set, so the page works with no backend and no network.

The CSS in that file is a **starting point, not a spec**. The script only cares
about the `data-*` attributes — restyle everything else freely, then rebuild the
structure in Webflow as proper classes.

---

## 7. The glass wheel — colour behind, never in front

**The design rule for this whole funnel: nothing is a flat colour except a primary
button. Colour is light sitting *behind* glass.** The wheel follows it.

The palette is three colours and no others:

| | |
|---|---|
| `#AADB1E` | lime |
| `#3D45E0` | indigo |
| `#1EBEAA` | teal |

### How that works on a wheel whose colours come from an API

`GET /prizes/wheel` hands over a `color` per segment, chosen by an admin. Painting
those as flat fills gives you a stock prize wheel that looks like a different
product from the rest of the journey. So the default style — `data-spin-style="glass"`
— **does not paint them**. Segments become two alternating translucent panes
(`rgba(255,255,255,.06)` / `.025`) separated by hairlines, and every bit of colour
you see is a blurred layer *behind* the wheel showing through.

The admin's colours are not lost, just not used as fills. `data-spin-tint="0.25"`
blends them back in at whatever strength you want, and `data-spin-style="solid"`
restores the original behaviour outright.

> **Tell your backend dev.** The per-segment `color` is currently decorative on the
> frontend. If the admin UI implies those colours drive the look, that expectation
> needs correcting — or set a small `data-spin-tint` so they visibly do something.

### The layer stack

```
.spin-stage                    position: relative; aspect-ratio: 1/1;  NO filter
├── .spin-glow                 the three blurred lights — ALL the colour
│   ├── span.g-indigo          #3D45E0
│   ├── span.g-lime            #AADB1E
│   └── span.g-teal            #1EBEAA
├── [data-spin-wheel]          backdrop-filter: blur() — the real glass;
│                              the script draws the SVG inside
├── .spin-hub                  glass dial: a second, gentler blur on top
└── .spin-marker               rotated by --fc-pointer-angle
    └── [data-spin-pointer]    the marker itself
```

The dial gets its own `backdrop-filter: blur(10px)`. Its backdrop is the
already-frosted wheel plus the colour behind it, so a second gentler blur reads as a
thicker piece of glass resting on top.

`.spin-glow` is a **sibling** of the wheel, never a parent. Its own `filter: blur()`
would otherwise make it a backdrop root and kill the refraction above it (§ the trap,
below). Move those three blobs around and the whole wheel changes character without
a single segment fill changing — that is the point of the arrangement.

Because the segments are translucent now, `[data-spin-wheel]` **can** be a glass host
itself: it refracts the colour layer behind it, while the SVG (its child) paints on
top undistorted. That was not true of the old solid wheel, which covered its own
glass completely.

### Making each pane read as glass

**`backdrop-filter` cannot be applied to an SVG shape**, in any browser — it is a CSS
box property. So there is no way to give each `<path>` its own real glass. Doing it
"properly" would mean one clipped `<div>` with its own `backdrop-filter` per segment,
all of them recompositing every frame while the wheel turns — the most expensive
thing you could ask a store tablet to do, on the one animation that has to stay
smooth.

So the effect is split in two:

1. **One real blur, in CSS, on the wheel canvas.** It frosts the colour layer behind
   every pane at once. Cheap, static, and it works on iPad where refraction does not.

   ```css
   [data-spin-wheel] { backdrop-filter: blur(14px) saturate(1.25); }
   ```

2. **Two cues drawn by the script** that say "separate pieces of glass" at this scale:

   | Attribute | Default | |
   |---|---|---|
   | `data-spin-edge` | `0.3` | a lit hairline down each pane's leading radial edge, brightest at the rim and fading to nothing near the hub — the way light catches a bevel. Rotates **with** the wheel. |
   | `data-spin-edge-width` | `0.6` | |
   | `data-spin-sheen` | `0.14` | a specular overlay across the whole disc that does **not** rotate. |
   | `data-spin-light-angle` | `315` | where that light comes from. |
   | `data-spin-hub-radius` | 24% of the segment radius | where the lit edges fade out — keep it under your hub cap. |

**The fixed sheen is the important half.** Light that rotates with an object reads as
paint; light that stays put while the object turns underneath it reads as glass. That
one overlay does more for the effect than anything else in the renderer, which is why
it is drawn outside the rotor.

The rendered nodes are marked `[data-spin-edge-line]` and `[data-spin-sheen-layer]` —
deliberately *not* the same names as the config attributes above, so your CSS can
target one without also selecting the `[data-spin]` wrapper.

### The pointer angle has ONE source of truth

The landing maths uses `data-spin-pointer-angle`. The pointer you can *see* is
positioned in CSS. If you set those in two places they drift, and the failure is
silent and nasty: the wheel stops with the winning segment somewhere other than under
the marker, and the prize on screen is not the one the pointer is touching.

So the script publishes the angle back as a CSS custom property on the `[data-spin]`
wrapper. Rotate a full-size wrapper by it and the marker always agrees with where the
wheel stops:

```html
<div class="spin-marker"><div data-spin-pointer></div></div>
```
```css
.spin-marker      { position: absolute; inset: 0;
                    transform: rotate(var(--fc-pointer-angle, 0deg)); }
[data-spin-pointer] { position: absolute; left: 50%; top: -3%;
                      transform: translateX(-50%); }
```

Change `data-spin-pointer-angle` and the marker moves with it. **Do not hard-code the
pointer position in CSS.**

### The rim and the studs

The reference design has an outer ring band with a pearl stud at every segment
boundary. Those are count-dependent — seven segments means seven studs — so the
script draws them, inside the rotor, so they turn with the wheel. They are the
clearest read on how fast it is spinning.

The rim and the studs are **off by default** — the tuned look drops them for a
cleaner disc — but they are there when a design wants them.

| Attribute | Default | |
|---|---|---|
| `data-spin-rim` | `0` | width of the band in viewBox units; the segments stop below it |
| `data-spin-rim-stroke` | `rgba(255,255,255,.28)` | the two hairline circles |
| `data-spin-rim-width` | `0.6` | their thickness |
| `data-spin-studs` | `off` | one per segment boundary |
| `data-spin-stud-size` | `2.6` | |
| `data-spin-stroke-width` | `0` | hard segment dividers. The lit edges above usually read better. |

Label radius defaults to `87` (or just inside the band, whichever is smaller) and is
**clamped**, so a label can never run out under the studs whatever you type.

### The tuned starting point

These are the values the design settled on. Put them on `[data-spin]`:

```html
<div data-spin
  data-spin-turns="6"        data-spin-duration="4.5"
  data-spin-min="2.5"        data-spin-idle-turn="1.6"
  data-spin-pointer-angle="315"
  data-spin-style="glass"    data-spin-tint="0"
  data-spin-fill="rgba(255,255,255,0.06)"
  data-spin-fill-alt="rgba(255,255,255,0.025)"
  data-spin-rim="0"          data-spin-studs="off"
  data-spin-stroke-width="0"
  data-spin-label-mode="radial"  data-spin-label-size="5"
  data-spin-label-radius="87"    data-spin-label-color="#ffffff"
  data-spin-edge="0.3"       data-spin-sheen="0.14"
  data-spin-light-angle="315">
```

Most of these are now the script's defaults too, so a bare `[data-spin]` lands close
to this. The ones worth setting explicitly are `data-spin-pointer-angle` (it has to
match your marker) and the fills.

### Everything else that is glass

| Element | |
|---|---|
| `.spin-card` (every panel) | `backdrop-filter: blur(18px)`, hairline border, and a blurred three-colour `::before` behind it — same idea as the wheel. |
| `[data-spin-claim]` | Glass with a **bright** hairline. It has to read from a step away, and that contrast comes from luminance, not a fill. |
| `.cta` (primary) | **The one flat colour on the page.** Solid lime. |
| `.cta.ghost` (secondary) | Glass. Never colour. |
| `.spin-hub` | Glass, `data-lg-preset="nav"`. |

### Applying `glass.js` itself

Two facts from `glass.js` decide where its `data-liquid-glass` hook belongs:

1. **It refracts what is painted BEHIND the host.** `backdrop-filter` goes on the
   host; the injected `.lg-layer` sits at `z-index:-1`, behind the host's own
   children. A host's content is never distorted — only what is behind it.
2. **The displacement map is baked from the layout box plus ONE corner radius**, then
   cached. Rebuilt on resize, not per frame.

Which gives:

| Element | Verdict |
|---|---|
| `.spin-card`, `.cta`, `.spin-hub`, `[data-spin-wheel]` | **Yes.** |
| `.spin-stage` | **No** — and it must never carry a `filter`. |
| `[data-spin-pointer]` | **No** if it is `clip-path`'d: glass bakes its rim from the layout *box*, so a triangular pointer gets a rectangular refraction rim. |
| A separate dome over the wheel | **No.** It would distort every prize label into illegibility, and re-sample a large moving backdrop every frame — on the one animation that most needs to be smooth. |

The hub and the wheel canvas both use `data-lg-preset="nav"` (`press:0, tilt:0`).
Glass owns `transform` the moment press or tilt is on, and the hub is positioned
with `translate(-50%,-50%)` — they would fight and it would jump off centre on tap.

### The trap: a `filter` on an ancestor kills refraction

**This is the one that will bite you.** A CSS `filter` makes an element a *backdrop
root for its descendants*, so a filtered ancestor leaves a glass child with nothing
behind it to refract. Same mechanism that switched refraction off on the landing orb
(`data-orb-warp` on `orb-wrapper`; see CLAUDE.md).

A `drop-shadow` on the stage is the natural thing to write, and it silently disables
everything below it:

```css
/* WRONG — .spin-stage is an ancestor of the glass wheel and hub */
.spin-stage { filter: drop-shadow(0 26px 60px rgba(0,0,0,.55)); }

/* RIGHT — box-shadow gives the same depth without creating a backdrop root */
.spin-stage       { /* no filter */ }
[data-spin-wheel] { box-shadow: 0 30px 70px rgba(0,0,0,.6); }
```

Same applies to `backdrop-filter`, `opacity < 1`, `will-change: filter` and
`mix-blend-mode` on any ancestor.

### Entrance animations

Glass owns `transform`, so use **`data-anim-fade`** (opacity only) on a glass
element, never `data-anim`. If a glass panel animates its *size*, wrap the tween in
`LiquidGlass.freeze()` / `unfreeze()` so the map rebuilds once at the end rather than
every frame. Nothing on this page does, so no `freeze()` call is needed as built.

### Refraction is Chrome/Edge only

`glass.js` detects Safari and Firefox and falls back to `blur + saturate`. Lighting,
tint, frost and press still work — only refraction is gone.

**This matters for the kiosk build**: if the in-store tablets are iPads, every shopper
sees the fallback. The design above survives it (the colour layer, the hairlines and
the studs are all plain CSS/SVG), but check it on the real device. The playground
prints which one you are looking at.

### Try it

```
/demo/spin?spindemo&glass=1
```

The tuner has a **Glass wheel** section: style, tint, pane fills, rim width, studs.
All of it redraws live.

---

## 8. Building it in Webflow

You build everything. The script only ever fills one empty box.

### What is yours vs what is the script's

| Yours, in the Designer | The script's |
|---|---|
| The background and its gradient | The `<svg>` inside `[data-spin-wheel]` |
| Every panel: prize, consolation, redeemed, expired, voided, no-phone, fallback | Which panel is visible |
| Every button, every piece of copy | The text written into the API slots |
| The dial, the pointer graphic, the stage | The wheel's rotation and where it lands |
| All colour, type and spacing | — |

### Step 1 — paste the embed

`demo/spin-webflow-embed.html` is paste-ready. Put it in **Page Settings → Custom
Code → Inside `<head>` tag** on `/spin-to-win` (preferred — it applies before first
paint), or an HTML Embed inside the Barba container.

It is ~40 lines and it is entirely attribute-driven: **no class names**, so name your
Webflow classes whatever you like. It contains only the five things the Designer
cannot express — `backdrop-filter`, the pointer's `rotate(var(--fc-pointer-angle))`,
the injected SVG labels, `[aria-disabled]` styling, and the rule that stops every
panel flashing on screen at once before the script boots.

That last one matters more than it sounds: Webflow loads the scripts in the **footer**,
so without it there is a moment where the wheel, the prize screen and every error
screen are all visible stacked on top of each other.

### Step 2 — the wheel

```
Stage                  [data-spin-stage]     ← MUST be square
├── Glow               [data-spin-glow]      ← your background gradient (optional)
├── Wheel Canvas       [data-spin-wheel]     ← LEAVE EMPTY
├── Dial               [data-spin-hub]       ← your centre cap
└── Marker             [data-spin-marker]    ← full-size; rotates itself
    └── Pointer        [data-spin-pointer]   ← your graphic, at top centre
```

- **The stage must be square.** `aspect-ratio: 1/1` comes from the embed; just give
  it a width. A non-square stage letterboxes the wheel inside itself and the marker
  stops lining up with the segment that won — the script warns in the console if it
  catches it, and it is the single most common way a hand-built stage goes wrong.
- **Leave `[data-spin-wheel]` empty.** It is cleared on every render.
- **Never put a `filter` on the stage** (a `drop-shadow` is the tempting one). A
  filter makes an element a backdrop root for its descendants and the wheel would have
  nothing left to frost. Use `box-shadow` on the canvas instead.
- **The glow must be a sibling of the wheel, not a parent** — same reason.
- **Do not position the pointer with a hard-coded rotation.** Put it at top centre
  inside `[data-spin-marker]` and let `data-spin-pointer-angle` drive it.

### Step 3 — the panels

Every panel is an ordinary Webflow div. The only thing that has to survive is the
attributes. Build one, style it, duplicate it for the rest.

| Panel | `data-spin-when` | Must contain |
|---|---|---|
| Loading | `loading` | your skeleton/spinner |
| The wheel | `ready spinning` | the stage + `[data-spin-go]` |
| Won a prize | `prize` | `[data-spin-claim]` **large and high-contrast**, `[data-spin-prize-name]`, `[data-spin-instructions]`, `[data-spin-expires-wrap]`, `[data-spin-store]` |
| Consolation | `consolation` | `[data-spin-prize-name]`, `[data-spin-instructions]`. **No claim code** |
| Already collected | `redeemed` | "you've picked this up" |
| Lapsed | `expired` | "this reward has expired" |
| Cancelled | `voided` | "no longer valid" |
| No phone number | `nophone` | a link back to `/onboarding` |
| Anything went wrong | `unavailable error` | `[data-spin-error]` |

Space-separated values mean "show in any of these states", which is how the wheel
panel covers both `ready` and `spinning`.

**Write real copy in `[data-spin-instructions]` and `[data-spin-error]`.** The API is
allowed to send `null`, and the script falls back to whatever you authored — so
lorem ipsum will ship.

### Step 4 — the attributes on `[data-spin]`

The tuned values. Most are already the script's defaults, so a bare `[data-spin]`
lands close to this; set them explicitly if you want to be sure.

```
data-spin-turns="1"          data-spin-duration="1.5"
data-spin-min="2"            data-spin-idle-turn="1"
data-spin-pointer-angle="0"
data-spin-style="glass"      data-spin-tint="0"
data-spin-fill="rgba(255,255,255,0.06)"
data-spin-fill-alt="rgba(255,255,255,0.025)"
data-spin-rim="0"            data-spin-studs="off"
data-spin-stud-size="0.5"
data-spin-edge="1"           data-spin-edge-width="0.2"
data-spin-sheen="0.48"       data-spin-light-angle="40"
data-spin-label-mode="radial"
data-spin-label-size="4.5"   data-spin-label-radius="87"
data-spin-label-color="#ffffff"
data-spin-stroke-width="0"   data-spin-labels="on"
```

Plus the routing targets, which have no sensible defaults:

```
data-spin-product="/flexicare-product"    where to bounce if the quiz isn't finished
data-spin-onboarding="/onboarding"        where to bounce if there's no session
```

### Step 5 — the rest of the site

- Add `data-kiosk-idle-factor="2"` to this page, so a shopper reading a claim code
  doesn't have it yanked away at 90 seconds.
- Add `data-kiosk-screen="spin"` if you want the heartbeat to report it precisely.
- Re-paste the **footer script list** — it changed (§ hosting doc). `flexicare-kiosk.js`
  goes between core and onboarding; `flexicare-spin.js` after product.
- Build the `/kiosk` pairing page (§4).
- Optionally set `data-product-next-web` on the product page (§5).

### Step 6 — check it

Load `/spin-to-win?spindemo` on the published URL. You should get a drawn wheel and a
working spin with no backend and no paired tablet. Then `?spindemo=consolation`,
`=redeemed`, `=expired`, `=voided`, `=nophone`, `=unavailable` to check each panel you
built. Open the console — the script warns about a non-square stage and a misplaced
wrapper.

---

## 9. Building the page in Webflow before a tablet exists — `?spindemo`

The real page needs a `COMPLETED` session on a **paired** tablet, and pairing needs
a code from the admin UI. That is the right gate for production and a miserable one
for building the page: until a tablet is paired there is nothing on screen to style.

`?spindemo` skips the session entirely. Gated exactly like `?tune` and `?orbtune`.

| URL | What you get |
|---|---|
| `/spin-to-win?spindemo` | the real wheel, a real spin animation, a fake prize screen |
| `?spindemo=consolation` | straight to the consolation panel |
| `?spindemo=redeemed` | …the redeemed panel (also `expired`, `voided`) |
| `?spindemo=nophone` | …the no-phone panel |
| `?spindemo=unavailable` | …the fallback panel |

The segments still come from the real `GET /prizes/wheel` (public, no session), so
you are styling against live colours and labels. If that endpoint is unreachable it
falls back to a placeholder set, so the page is buildable with no backend at all.

What it never does: it never calls `POST /spin`, never creates an award, never
consumes stock, and never writes `Flexicare.award` — so a demo prize cannot leak
into a real session's state. Without the parameter the page behaves exactly as it
does in production.

**A demo spin proves the animation works. It proves nothing about the backend** —
drop the parameter before any real testing.

---

## 10. Testing checklist

Test on the **published or preview URL**, never the Designer.

1. **Pair a tablet.** Open `/kiosk`, get a code from the admin, pair. The panel
   should flip to "Paired" with the store name.
2. **Confirm the session is KIOSK.** Run the funnel from the landing page. In the
   console: `Flexicare.kiosk.isKiosk()` → `true`, and after onboarding
   `await Flexicare.api("/sessions/" + Flexicare.getSessionId())` → `channel: "KIOSK"`.
   If it says `WEB`, the token was not present at session creation — start over
   after pairing, don't try to fix it downstream.
3. **Finish the quiz** through to the product page.
4. **Spin.** The wheel should start turning on tap, before the response.
5. **Reload the spin page.** It must re-show the same prize and the same claim
   code, and must not offer another spin.
6. **Spin again on the same phone number** (new session, same number): "already
   spun" copy, no wheel.
7. **Web check.** In a normal browser, `/spin-to-win` should show the fallback
   copy and never draw a wheel.
8. **Idle check.** Leave a tablet mid-quiz. After `idle_timeout_seconds` it should
   return to the attract screen with a clean session.

Add `?fcdebug` for the transition diagnostics, and `data-spin-debug` /
`data-kiosk-debug` on the wrappers for this feature's own console logging.
