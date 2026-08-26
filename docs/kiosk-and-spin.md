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

## 6. Testing checklist

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
