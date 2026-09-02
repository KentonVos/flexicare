# Kiosk tablet setup — Samsung Galaxy Tab S10 FE

How to run the Flexicare funnel full screen on an in-store tablet, with no browser
UI and no way for a shopper to navigate away.

Companion docs: `docs/kiosk-and-spin.md` (pairing, the token chain, the prize wheel),
`docs/webflow-head-snippet.md` (the viewport pin).

---

## 1. The approach, and why it is not a PWA

**The fullscreen behaviour comes from the Fullscreen API, triggered by the shopper's
first tap. Samsung's native app pinning stops anyone leaving.** No third-party kiosk
app, no manifest, no service worker, no change to how the site is hosted.

The obvious alternative — install the site as a PWA so Chrome builds a WebAPK that
launches with `"display": "fullscreen"` — **is not available to us**, and it is worth
recording why so nobody re-proposes it:

| Requirement | Why it fails here |
|---|---|
| `manifest.json` at the site root | Chrome resolves `start_url` against the **manifest's** origin and rejects a cross-origin one. So the manifest must be on the site's own origin at a root path, and Webflow gives you nowhere to put a file at the root — only the asset CDN, which is a different domain. |
| `sw.js` at the site root | Service workers are hard same-origin with **no CORS escape hatch**, and a worker's scope is capped by its own path. Cannot be hosted on the Worker, cannot be hosted on the asset CDN. |

The Cloudflare Worker in this project serves `/src/*.js` to Webflow — it is **not** a
reverse proxy in front of the site, so it cannot inject root-path files on the site's
origin. Making it one is the only route to a real PWA; see §7.

### What the Fullscreen API gives us

Chrome on Android goes genuinely edge-to-edge on `requestFullscreen()` — the address
bar **and** the system status bar both go. That is the entire kiosk look, for free.

Three properties of this codebase make one tap enough for a whole shift:

1. **Fullscreen survives same-document navigation, and Barba never reloads.** One tap
   on the landing page holds for the entire funnel.
2. **The idle reset navigates with `barba.go()`**, so returning to the attract screen
   keeps fullscreen. A `location.reload()` would drop out of it on every lap.
3. **The landing page's "Tap anywhere to begin" is already a full-bleed tap target**,
   so the first shopper's first touch arms it even if the operator forgot.

⚠️ **Do not replace either `barba.go()` with a hard redirect.** It looks harmless and
it silently costs you fullscreen on every idle reset. This is the same rule that
protects the buffered selfie — see CLAUDE.md.

---

## 2. Code — already shipped

Nothing to do here; this is what is in the repo.

### `flexicare-kiosk.js` — fullscreen on tap

- A capture-phase `pointerdown` listener on `document` calls
  `requestFullscreen({ navigationUI: "hide" })` on `<html>`.
- **Every** tap re-arms it, not just the first: a system dialog or a stray swipe can
  drop the tablet out mid-shift, and the next shopper's touch quietly restores it. It
  is a no-op when already fullscreen.
- **Kiosk devices only**, so a web visitor's browser is never hijacked. Two ways in:
  - the device is **paired** (automatic), or
  - **`?fullscreen`** has been added to the URL once on this device. Stored in
    `localStorage`, so it survives the tab closing and a reboot — this describes a
    *device*, like the pairing token beside it. Clear with `?fullscreen=off`.
  - You need the flag while **setting the tablet up**: gating on the token alone meant
    fullscreen did not arrive until the last step and looked broken until then.
- Rejections are swallowed and logged to the debug channel only. Failing to go
  fullscreen must never break the journey.
- Opt out on a paired device with **`data-kiosk-fullscreen="off"`** on any element
  (read document-wide — one device, one answer).

Console:

```js
Flexicare.kiosk.fullscreen()
// { active, wanted, supported, paired, armed, optedOut, why }
// `why` says in words why nothing happened — read it first.

Flexicare.kiosk.armFullscreen()       // arm without retyping the URL
Flexicare.kiosk.armFullscreen(false)  // clear
Flexicare.kiosk.exitFullscreen()      // manual exit, without unpinning
```

**If tapping does nothing, run `Flexicare.kiosk.fullscreen()` and read `why`.** The
common answer is `"not paired and not armed"` — add `?fullscreen` once.

### The idle reset — already existed, do not add a second one

`flexicare-kiosk.js` has owned this since the kiosk work:

- `idle_timeout_seconds`, default 90, **tunable per device from the admin** with no
  deploy (it arrives on `/kiosks/me` and every heartbeat).
- `[data-kiosk-idle-factor="2"]` extends the window on a page. **It belongs on the
  prize page** — the shopper is photographing a claim code and yanking that away is
  the one genuinely costly timeout in the flow.
- It calls `FC.resetJourney()` before navigating, so the next shopper cannot inherit
  a session.
- It navigates with `barba.go()`, which is what preserves fullscreen.

A hand-rolled `setTimeout(() => location.reload(), …)` would double-fire against
this, drop fullscreen every cycle, and discard the buffered selfie.

### The viewport — one tag, owned by the head snippet

The head snippet in Site Settings **owns `<meta name="viewport">`** and rewrites it to
`width=991` on a large tablet, which is what makes every Webflow tablet breakpoint
fire. The Tab S10 FE reports well above 991, so it is on that forced branch.

`viewport-fit=cover` is appended **inside the snippet** (changed 2026-09-01), not added
as a second tag — a second tag is either silently overwritten or, if it wins the race,
cancels the tablet pin.

⚠️ **Never add `maximum-scale=1` / `user-scalable=no` there.** On the forced branch they
fight the fit-to-width scaling. Kill pinch-zoom with `touch-action` in CSS instead (§3).

Verify on the device:

```js
document.querySelector('meta[name=viewport]').content
// → "width=991, viewport-fit=cover"
Flexicare.layout.forced   // → true
```

`forced: false` on this tablet means the head snippet is missing from Webflow.

---

## 3. Webflow — touch hardening CSS

**Applied 2026-09-01** as a fifth block in Site Settings → Custom Code → Head Code
(Designer only — needs a publish). Reproduced here as the source of truth.

In the head site-wide (page-level head code only exists if that page was loaded first),
but **scoped by the selector to `html[data-kiosk-locked]`** — which
`flexicare-kiosk.js` sets on a device that is paired **on a tablet**, or armed with
`?fullscreen`, and **not** paired with the dev code.

⚠️ **That scope is load-bearing.** `overscroll-behavior: none` kills pull-to-refresh, and
the first version of this block was unscoped, which took pull-to-refresh away from every
developer and every phone visitor too. Only a pinned tablet wants it.

**Pull-to-refresh on a tablet you are testing on** (added 2026-09-02): pair it with the
dev code `5555-5555` and `data-kiosk-locked` is not set, so this whole block goes inert
and pull-to-refresh comes back. Fullscreen-on-tap is unaffected — it keys off
eligibility, not this hook. On a store tablet (a real pairing) the hardening stays, and
it should: a reload drops fullscreen *and* the buffered selfie, and neither survives a
shopper's thumb pulling down mid-journey.

Note the exemption drops the **whole** block, so a dev tablet also gets back
double-tap-to-zoom, long-press menus and text selection. If you ever need only
`overscroll-behavior` back on a real pairing, split that one rule into its own selector
here rather than changing the JS. `Flexicare.kiosk.fullscreen().touchHardened` reports
which side of this a device is on.

```css
/* Kiosk touch hardening. Inert unless flexicare-kiosk.js has marked the
   device: paired, or armed with ?fullscreen. */
html[data-kiosk-locked],
html[data-kiosk-locked] body {
  overscroll-behavior: none;   /* no pull-to-refresh, no scroll chaining */
  touch-action: manipulation;  /* no double-tap-to-zoom (keeps pan + pinch) */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none; /* no long-press context menu */
}

/* Text selection has to come BACK on anything typed into, or the onboarding
   form and the spin lead form (six fields) behave strangely under a caret. */
html[data-kiosk-locked] :is(input, textarea, [contenteditable="true"]) {
  -webkit-user-select: text;
  user-select: text;
}
```

---

## 4. Device configuration (manual, per tablet)

1. **Developer options → Stay awake.** Settings → About tablet → Software information
   → tap Build number ×7. Then Settings → Developer options → **Stay awake**. This is
   the only native way past Samsung's 10-minute screen-timeout ceiling. **Requires
   mains power.**
2. **Open the funnel in Chrome** at the published URL **with `?fullscreen` on the end**,
   once. That arms fullscreen on this device before it is paired — you want it during
   setup, not only at the end. Clear it with `?fullscreen=off`.

   Leave the tab open. Because pairing is required on every screen, the **pairing gate**
   takes you straight to `/kiosk` — it is on by default and there is nothing to arm.
   (`?kiosk=off` turns it off for one device, for development only.)
3. **Pair the device.** Enter the code from the admin UI. The panel should flip to
   "Paired" with the store name. Confirm:
   ```js
   Flexicare.kiosk.isKiosk()   // → true
   Flexicare.kiosk.isDev()     // → false  (true means you used the dev code)
   ```
   Pair **from the tab you will actually run**, not a different browser or profile —
   the token is per-origin-per-browser-storage.

   *While testing, before the admin can issue real codes:* `5555-5555` pairs the
   device locally — enough for the gate, fullscreen and the idle reset, but the
   session is still `WEB` and the wheel needs `?demo`. See
   `docs/kiosk-and-spin.md` §4. **Never leave a store tablet on the dev code.**
4. **Tap the screen once** to enter fullscreen. Confirm
   `Flexicare.kiosk.fullscreen().active === true`.
5. **Screen lock + app pinning.** Settings → Lock screen → Screen lock type → **PIN**.
   Then Settings → Security and privacy → Other security settings → **Pin app** → on,
   with **"Ask for PIN before unpinning"** enabled.
6. **Silence interruptions.** Do Not Disturb on. Settings → Advanced features: disable
   Edge panels and the side-button Bixby/Assistant shortcut. Lock screen → Always On
   Display off. Software update → auto-download off. Bluetooth off.
7. **Display.** Adaptive brightness off, brightness set for the venue. Screen timeout
   10 min as a backstop. Rotation locked to the stand's orientation.
8. **Pin it.** Swipe up and hold for Recents → tap the app's icon at the top of its
   card → **Pin this app**.

---

## 5. Acceptance checklist

- [ ] `Flexicare.layout.forced` → `true`, viewport reads `width=991, viewport-fit=cover`
- [ ] `Flexicare.kiosk.isKiosk()` → `true`, `Flexicare.kiosk.isDev()` → `false`
- [ ] `Flexicare.kiosk.gate()` → `enforced: true`, `wouldRedirect: false`
- [ ] **Unpair test:** run `Flexicare.kiosk.unpair()` mid-funnel — the tablet must
      land back on `/kiosk`, not carry on. Then re-pair.
- [ ] One tap → no address bar, no status bar (`kiosk.fullscreen().active` → `true`)
- [ ] Fullscreen **survives the whole funnel** — walk landing → onboarding → quiz →
      reveal → product → spin without it dropping
- [ ] Fullscreen **survives the idle reset** — leave it 90s mid-quiz, confirm it
      returns to the attract screen still fullscreen, with a fresh session
- [ ] Pinch, double-tap and long-press: no zoom, no selection, no context menu
- [ ] Swiping down from the top does not refresh
- [ ] The onboarding form and the spin lead form still accept typing normally
- [ ] A completed run reaches the wheel and spins (i.e. the session is `KIOSK`)
- [ ] App pinning blocks Home / Recents / back-out

---

## 5b. If it is still not fully fullscreen

Work down this list — the first two are what actually goes wrong.

1. **`Flexicare.kiosk.fullscreen().why`** — if it says *not paired and not armed*,
   nothing was ever attempted. Add `?fullscreen` once, or run
   `Flexicare.kiosk.armFullscreen()`.
2. **You have to TAP after the page loads.** `requestFullscreen()` is only allowed from
   inside a user gesture, so it cannot fire on load. The listener is on `pointerdown`,
   so any tap anywhere does it.
3. **Check the browser.** This is verified on **Chrome**. Samsung Internet's fullscreen
   behaviour differs and it may keep a bar; if you are on it, switch to Chrome.
4. **`supported: false`** means the browser has no `requestFullscreen` at all. Nothing
   in this document will help — that is the PWA/kiosk-browser case (§7).
5. **`active: true` but a bar is still visible.** Then the bar is not browser chrome:
   - Android's **navigation** bar (or gesture pill) at the *bottom* can persist. Locking
     rotation and using a stand that covers the edge is the usual answer.
   - **App pinning** shows its own hint on entry. It clears on its own.
   - A **notch/cutout** area is now painted into thanks to `viewport-fit=cover`, but
     content near the edge may need `env(safe-area-inset-*)` padding in Webflow.

If `active` is `true` and the top status bar is still there on Chrome, that is worth
reporting back — it would be new information, and it changes the recommendation toward
§7.

---

## 6. Known limitations, and what to tell on-site staff

**The pinning does not survive a reboot. The pairing does.** This distinction matters
and is easy to get wrong:

| After a reboot | State |
|---|---|
| App pinning | **Lost.** Re-pin (§4 step 8). |
| Fullscreen | **Lost.** One tap restores it. |
| Device pairing | **Kept.** The token is in `localStorage` precisely so it outlives sessions and restarts. |
| The `?fullscreen` arming | **Kept.** Also `localStorage`, for the same reason. |

So a rebooted tablet needs the PIN and two gestures — **not** a new pairing code from
the admin. Brief staff accordingly, and keep the tablets on mains power.

Other limitations:

- **System dialogs can appear over the app** — low storage, forced updates, pairing
  requests. Clear storage and disable radios beforehand. The next tap restores
  fullscreen afterwards.
- **No remote monitoring of the device itself.** The heartbeat does tell the admin the
  tablet is online and which screen it is on (`Flexicare.kiosk.setScreen`), which
  covers most of what you would want this for — but there is no way to push a device
  config change or see the Android state from off-site.
- **Offline is not survivable, and caching would not fix it.** The funnel is API-driven
  end to end — sessions, quiz questions, generated images, the prize wheel — so a
  Wi-Fi drop mid-quiz breaks the journey whether or not the shell is cached. Cache the
  venue's connectivity plan, not the assets.

---

## 7. If you later want a real PWA

Only worth it for offline resilience — it buys nothing on browser chrome that §1
does not already give you.

Point the custom domain at Cloudflare and have a Worker proxy Webflow. That puts one
origin in front of everything, so the Worker can serve `/manifest.json` and `/sw.js`
on the real origin and Chrome will offer **Install app**.

Two things to get right if you do:

1. ⚠️ **`_headers` serves `/src/*` with `max-age=0, must-revalidate` so a push ships
   instantly.** A cache-first service worker over those files would pin the tablet to
   old code and quietly undo the entire publishing model. Use network-first for
   `/src/*`, or exclude it from the worker outright.
2. **Verify whether a WebAPK shares `localStorage` with the Chrome tab it was installed
   from** before assuming the pairing carries over. If it does not, pair from inside
   the installed app. Either way, pair from the surface you will run.
