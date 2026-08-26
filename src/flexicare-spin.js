/* ============================================================
   Flexicare Spin v1 — "Spin for your Clicks reward"  (/spin-to-win)
   ------------------------------------------------------------
   Plain JS (ES5-style). Load AFTER flexicare-core.js, flexicare-kiosk.js,
   @barba/core and gsap.

   WHAT THIS PAGE DOES
     The very last beat, and the only KIOSK-ONLY one in the funnel. After the
     product page, a shopper on an in-store tablet spins a wheel and wins one
     of six physical prizes (or a consolation "try again" segment), then shows
     the claim code to a Clicks team member.

       1. GET /sessions/{id}   — one call answers everything: is it COMPLETED,
          is it a KIOSK session, is there a phone number, has it already spun,
          and which store is it bound to.
       2. GET /prizes/wheel    — the segments. ADMIN DATA: count, order,
          labels and colours all come from here. Nothing about the wheel is
          hard-coded, including how many slices it has.
       3. POST /sessions/{id}/spin  — THE SERVER DECIDES. Stock and pacing are
          enforced server-side; this page only animates to the index it is
          told to land on.

   THE SERVER OWNS THE OUTCOME
     There is no client-side randomness anywhere in this file, and there must
     never be. `segment_index` in the response IS the result. We spin at a
     constant speed while the request is in flight and only then decelerate
     onto the segment — which is also why the wheel starts turning on tap,
     BEFORE the response: it buys the latency for free instead of making the
     shopper watch a spinner.

   IDEMPOTENT BY DESIGN
     The server records exactly one award per session. Re-calling POST /spin
     returns the SAME award — same claim code, same segment. So a double-tap,
     a dropped connection or a reload mid-animation is safe, and a second 200
     is never a second prize. On re-entry we don't even ask: `has_prize` on
     the session tells us, and GET /sessions/{id}/prize re-shows it.

   WHY A WEB VISITOR SEES A DEAD END HERE (and that is correct)
     POST /spin on a `channel: "WEB"` session is a hard 409. Rather than let
     someone tap a wheel that cannot pay out, we detect the WEB channel up
     front and show the "unavailable" panel. If your funnel sends web traffic
     this way at all, set data-product-next-web on the product page so they
     skip this page entirely — see flexicare-product.js.

   NOTHING HERE MAY BLOCK THE FLOW
     Every failure path — 503 wheel not configured, network down, an
     unexpected 409 — lands on the same fallback copy: "ask a Clicks team
     member." The shopper keeps their results and their images. The spin is
     the one part of the journey that is allowed to simply not happen.

   ------------------------------------------------------------
   WEBFLOW ATTRIBUTE CONTRACT

     [data-spin]                REQUIRED. Wrapper/marker for the page — gates
                                init. Config attributes on it:
                                  data-spin-onboarding="/onboarding"  bounce
                                     target when there is no session id
                                  data-spin-product="/flexicare-product"  bounce
                                     target when the session isn't COMPLETED
                                  data-spin-done="/"      optional "finish" CTA
                                  data-spin-turns="1"     extra full rotations
                                     before landing
                                  data-spin-duration="1.5" seconds of the
                                     landing tween
                                  data-spin-idle-turn="1" seconds per rotation
                                     while waiting for the response
                                  data-spin-min="2"       minimum seconds of
                                     spinning before landing may start, even if
                                     the API answers instantly
                                  data-spin-pointer-angle="0"  where the pointer
                                     sits, in degrees clockwise from 12 o'clock.
                                     The script publishes this back as the CSS
                                     custom property --fc-pointer-angle on the
                                     [data-spin] wrapper, so position the
                                     VISIBLE pointer with
                                       transform: rotate(var(--fc-pointer-angle))
                                     on a full-size wrapper. Do that and the
                                     marker and the landing maths can never
                                     drift apart. Hard-code the pointer in CSS
                                     instead and a mismatch is silent: the
                                     wheel stops with the winning segment
                                     somewhere other than under the marker.
                                  data-spin-style="glass|solid"  HOW THE WHEEL
                                     IS PAINTED. Default "glass": the segments
                                     are translucent, the only colour comes
                                     from whatever you put BEHIND the wheel,
                                     and the admin's per-segment `color` is
                                     used only as a faint tint (see
                                     data-spin-tint). "solid" fills each
                                     segment with its `color` outright.
                                  data-spin-fill / -fill-alt   the two
                                     alternating segment fills in glass style
                                     (default rgba white .06 / .025). Any CSS
                                     colour.
                                  data-spin-tint="0"      0–1. How much of the
                                     admin's per-segment `color` to blend in.
                                     0 = pure glass (the default).
                                  data-spin-rim="12"      width of the outer
                                     ring band, in viewBox units (0 = none).
                                     The segments stop below it.
                                  data-spin-rim-stroke / -rim-width  the two
                                     hairline circles bounding that band.
                                  data-spin-studs="on|off"  the pearl studs on
                                     the rim — one per segment boundary.
                                  data-spin-stud-size="0.5"
                                  data-spin-stud-fill="#ffffff"
                                  (the rendered nodes are marked
                                   [data-spin-edge-line] and
                                   [data-spin-sheen-layer], deliberately NOT
                                   the same names as these config attributes,
                                   so your CSS can target one without the other)
                                  data-spin-edge="1"      brightness of the lit
                                     edge down each pane's leading side — the
                                     cue that makes a segment read as its own
                                     piece of glass. 0 = off.
                                  data-spin-edge-width="0.2"
                                  data-spin-edge-color="#ffffff"
                                  data-spin-sheen="0.48"  a specular overlay
                                     that does NOT turn with the wheel. Light
                                     that rotates with an object reads as
                                     paint; light that stays put reads as
                                     glass. 0 = off.
                                  data-spin-light-angle="40"   where that light
                                     comes from, degrees clockwise from 12.
                                  data-spin-hub-radius     where the lit edges
                                     fade out (default 24% of the segment
                                     radius) — keep it under your hub cap.
                                  data-spin-labels="on|off"    draw segment text
                                  data-spin-label-mode="radial|tangential"
                                  data-spin-label-size="4.5"   viewBox units
                                  data-spin-label-color="#ffffff"
                                  data-spin-label-radius        outer edge the
                                     radial labels reach to. Defaults to just
                                     inside the rim band; clamped so a label
                                     can never overlap the studs.
                                  data-spin-icons="on"    draw segment image_url
                                  data-spin-icon-size="22"
                                  data-spin-icon-radius="42"
                                  data-spin-stroke="#ffffff"   segment divider
                                  data-spin-stroke-width       hairline dividers.
                                     Defaults to 0.5 in glass style, 0 in solid.
                                  data-spin-expires-format="Claim by {date}"
                                  data-spin-debug         console logging

     STYLING HOOKS (the script does not read these — they exist so the
     required CSS can be attribute-driven and you can name your Webflow
     classes whatever you like). See demo/spin-webflow-embed.html:
     [data-spin-stage]          The square container holding the wheel, the
                                dial and the marker. MUST be square.
     [data-spin-hub]            The dial that caps the wheel's centre.
     [data-spin-marker]         A full-size wrapper around the pointer,
                                rotated by --fc-pointer-angle.
     [data-spin-glow]           Optional. Your colour layer. Must be a
                                SIBLING of the wheel, never its parent.

     THE WHEEL (Webflow supplies an EMPTY box; this script fills it):
     [data-spin-wheel]          REQUIRED. A square, position:relative box. The
                                script injects one <svg> that fills it. Do NOT
                                put anything else inside — it is cleared on
                                every render. Layer the pointer, the hub and
                                any rim/glow OVER it as normal Webflow
                                elements, absolutely positioned.
     [data-spin-go]             REQUIRED. The spin button. Disabled by the
                                script until the wheel is ready, and for good
                                once a prize exists.
     [data-spin-pointer]        Optional. Purely decorative here — the script
                                never moves it; it reads WHERE it is from
                                data-spin-pointer-angle instead.

     PANELS — the one visibility mechanism for the whole page:
     [data-spin-when="ready spinning"]
                                Shown only while data-spin-state is one of the
                                listed values; display:none otherwise. Space
                                separated. This is how the wheel, the prize
                                screen and every error state share one page
                                without a second Barba navigation.

     API-DRIVEN SLOTS (written as TEXT — server copy is never trusted as HTML):
     [data-spin-name]           first_name from the award / session.
     [data-spin-name-wrap]      Hidden when there is no name, so the greeting
                                reads cleanly without one.
     [data-spin-store]          location.name ("Clicks Sandton City").
     [data-spin-prize-name]     prize.name — the full name, for the prize screen.
     [data-spin-prize-label]    prize.label — the short on-wheel copy.
     [data-spin-claim]          claim_code, e.g. "FLX-7K3M-9Q2A". Make this
                                LARGE and high-contrast: staff read it off the
                                tablet, or the shopper photographs it. It is
                                deliberately left EMPTY on a consolation award.
     [data-spin-claim-wrap]     Hidden whenever there is no code to emphasise
                                (consolation, or an award that is no longer
                                claimable).
     [data-spin-instructions]   instructions from the API. Falls back to the
                                element's own authored copy when the API sends
                                null, so write real copy in the Designer.
     [data-spin-expires]        Formatted from expires_at.
     [data-spin-expires-wrap]   Hidden when expires_at is null (= never expires).
     [data-spin-error]          Message box for the fallback copy. Its authored
                                text is used as the default message.

   STATE (drive your CSS and your panels off this — set on the wrapper AND
   on <html>, so a full-bleed background can react too):
     data-spin-state = "loading"      resolving the session + the wheel
                     | "ready"        wheel drawn, CTA live
                     | "spinning"     turning; CTA disabled
                     | "prize"        won a real prize — show the claim code
                     | "consolation"  the "try again" segment — no code emphasis
                     | "redeemed"     staff have already handed it over
                     | "expired"      the claim code lapsed
                     | "voided"       an admin cancelled it
                     | "nophone"      no phone number on the session
                     | "unavailable"  web session, wheel down, already spun…
                     | "error"        anything unexpected
   Plus data-spin-reason on the wrapper for granular copy inside a state:
     "web" | "wheel" | "already-spun" | "other-kiosk" | "disabled"
     | "rate-limit" | "network" | "unknown"

   ------------------------------------------------------------
   DEV-ONLY DEMO MODE  —  ?spindemo   (gated exactly like ?tune / ?orbtune)

   The real page needs a COMPLETED session on a PAIRED tablet, which needs a
   pairing code from the admin UI. That is the right gate for production and a
   miserable one for building the page: until a tablet is paired there is
   nothing on screen to style.

   ?spindemo skips the session entirely so the wheel, the spin animation and
   every panel can be built and tuned in the Designer's published preview.

     ?spindemo                → draw the wheel, spin to a random segment,
                                show a FAKE prize screen
     ?spindemo=consolation    → jump straight to the consolation panel
     ?spindemo=redeemed       → …the redeemed panel   (also: expired, voided)
     ?spindemo=nophone        → …the no-phone panel
     ?spindemo=unavailable    → …the fallback panel

   What it does NOT do, and must never do:
     • it never calls POST /spin — no award is created, no stock is consumed
     • it never writes Flexicare.award, so a demo prize cannot leak into a real
       session's state
     • it is unreachable without the query parameter

   The segments still come from the real GET /prizes/wheel (that endpoint is
   public and needs no session), so the colours and labels you style against
   are the live ones. If it is unreachable it falls back to a placeholder set
   so the page is still buildable offline.

   REMOVE THE PARAMETER BEFORE ANY REAL TESTING. A demo spin proves the
   animation works; it proves nothing about the backend.
   ============================================================ */
(function () {
  "use strict";

  if (!window.Flexicare) {
    console.warn("[spin] flexicare-core.js must load first.");
    return;
  }
  var FC = window.Flexicare;

  var gradSeq = 0; // unique gradient ids per render — see renderWheel
  var SVG_NS = "http://www.w3.org/2000/svg";
  var XLINK_NS = "http://www.w3.org/1999/xlink";
  var VIEW = 200; // viewBox units — the wheel is drawn in a 200x200 square
  var CX = 100;
  var CY = 100;
  var R = 96; // leaves a little room for a stroke at the rim

  var state = {
    wrap: null,
    token: 0, // bumped on every arrival/teardown; invalidates in-flight work
    segments: null, // from GET /prizes/wheel
    session: null, // from GET /sessions/{id}
    award: null, // PrizeAwardOut, once spun (or recovered)
    rotor: null, // the <g> everything spins on
    idleTween: null,
    landTween: null,
    spinStartedAt: 0,
    busy: false, // a spin request is in flight
    mode: null, // current data-spin-state
    wheelReq: null, // in-flight GET /prizes/wheel
    cooldownTimer: null,
    cooldownUntil: 0,
    debug: false,
    demo: null, // ?spindemo — dev only; see the header comment
  };

  /* Used only when ?spindemo is on AND GET /prizes/wheel is unreachable, so
     the page can still be built with no backend at all. Never used in
     production: the real segment list is admin data and always comes from
     the API. */
  var DEMO_SEGMENTS = [
    { index: 0, code: "PHONE_CARD_HOLDER", label: "Phone card holder", color: "#C6E84A", is_consolation: false },
    { index: 1, code: "WATER_BOTTLE", label: "Water bottle", color: "#2E7D32", is_consolation: false },
    { index: 2, code: "FIRST_AID_KIT", label: "First aid kit", color: "#C6E84A", is_consolation: false },
    { index: 3, code: "PILL_BOX", label: "Pill box", color: "#2E7D32", is_consolation: false },
    { index: 4, code: "GYM_BALL", label: "Gym ball", color: "#C6E84A", is_consolation: false },
    { index: 5, code: "CLICKS_VOUCHER", label: "Clicks voucher", color: "#2E7D32", is_consolation: false },
    { index: 6, code: "TRY_AGAIN", label: "Try again", color: "#9E9E9E", is_consolation: true },
  ];

  function dbg() {
    if (window.console && (window.FLEXICARE_DEBUG || state.debug))
      console.log.apply(console, ["[spin]"].concat([].slice.call(arguments)));
  }

  /* ------------------------------ helpers ------------------------------ */

  function one(sel, root) {
    return (root || document).querySelector(sel);
  }
  function attr(el, name, def) {
    var v = el && el.getAttribute && el.getAttribute(name);
    return v === null || v === undefined || v === "" ? def : v;
  }
  function num(el, name, def, min, max) {
    var n = parseFloat(attr(el, name, ""));
    if (isNaN(n)) return def;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  }
  function alive(token) {
    return token === state.token;
  }
  function attached(el) {
    return !!(el && document.contains(el));
  }
  function now() {
    return new Date().getTime();
  }
  function reduced() {
    try {
      return (
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (e) {
      return false;
    }
  }
  function samePath(url) {
    try {
      return (
        new URL(url, location.href).pathname.replace(/\/+$/, "") ===
        location.pathname.replace(/\/+$/, "")
      );
    } catch (e) {
      return false;
    }
  }
  function realHref(el) {
    var h = el && el.getAttribute && el.getAttribute("href");
    return h && h !== "#" ? h : null;
  }
  function go(url) {
    if (!url) return;
    if (samePath(url)) {
      dbg("already at", url, "— not navigating");
      return;
    }
    if (window.barba && typeof window.barba.go === "function")
      window.barba.go(url);
    else window.location.href = url;
  }

  /* Every lookup is scoped to the INCOMING wrapper first. During a Barba swap
     both containers are in the DOM and these pages are structurally similar,
     so a document-wide querySelector is a coin toss that can resolve into the
     container we are LEAVING — the bug that cost the reveal page two rounds of
     debugging. See CLAUDE.md. */
  function slots(sel) {
    var out = [];
    var seen = [];
    var roots = [];
    if (state.wrap) {
      roots.push(state.wrap);
      var c =
        state.wrap.closest && state.wrap.closest('[data-barba="container"]');
      if (c && c !== state.wrap) roots.push(c);
    }
    if (!roots.length) roots.push(document);
    for (var i = 0; i < roots.length; i++) {
      var found = roots[i].querySelectorAll(sel);
      for (var j = 0; j < found.length; j++) {
        var el = found[j];
        if (!attached(el) || seen.indexOf(el) !== -1) continue;
        seen.push(el);
        out.push(el);
      }
    }
    return out;
  }
  function slot(sel) {
    return slots(sel)[0] || null;
  }

  // TEXT, never innerHTML: every string written here is admin-authored copy
  // that arrives over the wire (labels, instructions, prize names).
  function write(sel, value) {
    slots(sel).forEach(function (el) {
      el.textContent = value == null ? "" : String(value);
    });
  }
  function show(sel, on) {
    slots(sel).forEach(function (el) {
      el.style.display = on ? "" : "none";
    });
  }

  /* ------------------------------- state ------------------------------- */

  function setState(mode, reason) {
    state.mode = mode;
    if (state.wrap) {
      state.wrap.setAttribute("data-spin-state", mode);
      if (reason) state.wrap.setAttribute("data-spin-reason", reason);
      else state.wrap.removeAttribute("data-spin-reason");
    }
    var root = document.documentElement;
    if (root) root.setAttribute("data-spin-state", mode);
    applyWhen();
    refreshButton();
    // Keep the admin's device list honest about where the shopper actually is.
    if (FC.kiosk && FC.kiosk.setScreen)
      FC.kiosk.setScreen(isAwardState(mode) ? "prize" : "spin");
    dbg("state →", mode, reason || "");
  }

  function isAwardState(mode) {
    return (
      mode === "prize" ||
      mode === "consolation" ||
      mode === "redeemed" ||
      mode === "expired" ||
      mode === "voided"
    );
  }

  function applyWhen() {
    slots("[data-spin-when]").forEach(function (el) {
      var list = (attr(el, "data-spin-when", "") + "").split(/\s+/);
      var on = false;
      for (var i = 0; i < list.length; i++)
        if (list[i] && list[i] === state.mode) on = true;
      el.style.display = on ? "" : "none";
    });
  }

  function refreshButton() {
    var btn = slot("[data-spin-go]");
    if (!btn) return;
    var enabled = state.mode === "ready" && !state.busy && !cooling();
    btn.disabled = !enabled;
    btn.setAttribute("aria-disabled", enabled ? "false" : "true");
    btn.setAttribute("data-spin-busy", state.busy ? "true" : "false");
  }

  /* The authored fallback copy is captured ONCE per element, on arrival —
     the error box gets blanked while spinning and during a 429 countdown, so
     reading it back at error time would find an empty string. */
  function captureDefaults() {
    slots("[data-spin-error]").forEach(function (node) {
      if (node.__spinDefault == null)
        node.__spinDefault =
          node.getAttribute("data-spin-error-copy") || node.textContent || "";
    });
    slots("[data-spin-instructions]").forEach(function (node) {
      if (node.__spinDefault == null) node.__spinDefault = node.textContent;
    });
  }

  function showError(msg, reason) {
    var box = slot("[data-spin-error]");
    var fallback =
      (box && box.__spinDefault) ||
      "We couldn't spin the wheel right now — please ask a Clicks team member.";
    write("[data-spin-error]", msg || fallback);
    setState("unavailable", reason || "unknown");
  }

  /* ------------------------ 429 cooldown on the CTA ------------------------
     The spin is rate-limited per kiosk (10/min). Retry-After is in SECONDS —
     count it down on the button rather than letting a queue of shoppers turn
     one 429 into ten. */

  function cooling() {
    return state.cooldownUntil > now();
  }
  function startCooldown(seconds) {
    state.cooldownUntil = now() + (seconds || 60) * 1000;
    if (state.cooldownTimer) clearInterval(state.cooldownTimer);
    state.cooldownTimer = setInterval(tickCooldown, 1000);
    tickCooldown();
  }
  function tickCooldown() {
    var left = Math.ceil((state.cooldownUntil - now()) / 1000);
    if (left <= 0) {
      stopCooldown();
      setState("ready");
      write("[data-spin-error]", "");
      return;
    }
    write("[data-spin-error]", "One moment — try again in " + left + " seconds.");
    refreshButton();
  }
  function stopCooldown() {
    if (state.cooldownTimer) clearInterval(state.cooldownTimer);
    state.cooldownTimer = null;
    state.cooldownUntil = 0;
  }

  /* ---------------------------- wheel geometry ----------------------------
     Angles are degrees CLOCKWISE FROM 12 O'CLOCK throughout this file, because
     that is where the pointer conventionally sits and it makes the landing
     maths readable. SVG's own 0° is 3 o'clock, hence the -90 in polar(). */

  function polar(r, deg) {
    var rad = ((deg - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  }
  function round(n) {
    return Math.round(n * 1000) / 1000;
  }
  function sectorPath(r, a0, a1) {
    var p0 = polar(r, a0);
    var p1 = polar(r, a1);
    var large = a1 - a0 > 180 ? 1 : 0;
    return (
      "M " +
      CX +
      " " +
      CY +
      " L " +
      round(p0.x) +
      " " +
      round(p0.y) +
      " A " +
      r +
      " " +
      r +
      " 0 " +
      large +
      " 1 " +
      round(p1.x) +
      " " +
      round(p1.y) +
      " Z"
    );
  }

  function el(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    for (var k in attrs)
      if (attrs.hasOwnProperty(k) && attrs[k] != null)
        node.setAttribute(k, String(attrs[k]));
    return node;
  }

  /* ------------------------------ rendering ------------------------------ */

  function renderWheel(segments) {
    var box = slot("[data-spin-wheel]");
    if (!box) {
      console.warn(
        "[spin] no [data-spin-wheel] element — add an empty square div for " +
          "the wheel; this script draws the SVG into it."
      );
      return false;
    }
    if (!segments || !segments.length) return false;

    /* The SVG's viewBox is square and it fills the box at 100% x 100%, so a
       non-square box letterboxes the wheel inside itself — the drawing shrinks
       to fit and stops touching the edge the pointer is aimed at. It still
       LOOKS like a wheel, which is why this is worth saying out loud: it is
       the single most common way a hand-built stage goes wrong, and the only
       symptom is that the marker no longer sits on the segment that won. */
    var bw = box.offsetWidth;
    var bh = box.offsetHeight;
    if (bw && bh && Math.abs(bw - bh) / Math.max(bw, bh) > 0.02) {
      console.warn(
        "[spin] [data-spin-wheel] is " + bw + "x" + bh + " — it must be SQUARE. " +
          "Give it aspect-ratio: 1 / 1 (or equal width and height), or the " +
          "wheel will not line up with the pointer."
      );
    }

    var w = state.wrap;

    /* GLASS is the default style, because the rest of the funnel is glass and
       a wheel of flat brand colours reads as a different product. In glass
       style the segments are barely-there translucent panes with hairline
       dividers, and ALL the colour is expected to come from a blurred layer
       BEHIND the wheel (see docs/kiosk-and-spin.md § the glass wheel).

       The admin's per-segment `color` still arrives from the API; it is simply
       not painted at full strength. data-spin-tint dials it back in if you
       ever want the segments to carry a hint of it. */
    var glassStyle = attr(w, "data-spin-style", "glass") !== "solid";

    var fillA = attr(w, "data-spin-fill", "rgba(255,255,255,0.06)");
    var fillB = attr(w, "data-spin-fill-alt", "rgba(255,255,255,0.025)");
    var tint = num(w, "data-spin-tint", 0, 0, 1);

    var rimBand = num(w, "data-spin-rim", 0, 0, R - 10);
    var rimStroke = attr(w, "data-spin-rim-stroke", "rgba(255,255,255,0.28)");
    var rimWidth = num(w, "data-spin-rim-width", 0.6, 0, 6);
    var showStuds = attr(w, "data-spin-studs", "off") === "on";
    var studSize = num(w, "data-spin-stud-size", 0.5, 0.1, 10);
    var studFill = attr(w, "data-spin-stud-fill", "#ffffff");

    // Segments stop below the rim band; the studs live in the middle of it.
    var segR = Math.max(10, R - rimBand);
    var studR = R - rimBand / 2;

    var showLabels = attr(w, "data-spin-labels", "on") !== "off";
    var labelMode = attr(w, "data-spin-label-mode", "radial");
    var labelSize = num(w, "data-spin-label-size", 4.5, 2, 30);
    var labelColor = attr(w, "data-spin-label-color", "#ffffff");
    // Default to just inside the segment edge, and clamp — a label must never
    // run out under the studs, whatever the author types.
    var labelRadius = Math.min(
      num(w, "data-spin-label-radius", Math.min(87, segR - 3), 10, R),
      segR - 1
    );
    var showIcons = attr(w, "data-spin-icons", "off") === "on";
    var iconSize = num(w, "data-spin-icon-size", 22, 4, 80);
    var iconRadius = num(w, "data-spin-icon-radius", 42, 0, segR);
    var strokeColor = attr(w, "data-spin-stroke", "rgba(255,255,255,0.4)");
    var strokeWidth = num(w, "data-spin-stroke-width", 0, 0, 10);

    /* ---- what makes each pane read as its own piece of glass ----
       backdrop-filter CANNOT be applied to an SVG shape, in any browser — it
       is a CSS box property. So per-segment "real" glass would mean one
       clipped <div> with its own backdrop-filter per segment, all of them
       recompositing every frame while the wheel turns. That is the most
       expensive thing you could ask a store tablet to do, on the one animation
       that has to stay smooth.

       Instead: ONE real blur lives on the wheel canvas in CSS (cheap, static
       backdrop), and the panes get the two cues that actually say "glass" at
       this scale — a lit edge, and a specular sheen that stays PUT while the
       wheel spins underneath it. The fixed sheen is the important half: light
       that rotated with the object would read as paint. */
    var edge = num(w, "data-spin-edge", glassStyle ? 1 : 0, 0, 1);
    var edgeWidth = num(w, "data-spin-edge-width", 0.2, 0.1, 4);
    var edgeColor = attr(w, "data-spin-edge-color", "#ffffff");
    var sheen = num(w, "data-spin-sheen", glassStyle ? 0.48 : 0, 0, 1);
    var lightAngle = num(w, "data-spin-light-angle", 40);

    var svg = el("svg", {
      viewBox: "0 0 " + VIEW + " " + VIEW,
      width: "100%",
      height: "100%",
      role: "img",
      "aria-label": "Prize wheel",
      "data-js-injected": "", // transition.js's class sync must skip this
      "data-spin-svg": "",
    });
    svg.style.display = "block";
    svg.style.overflow = "visible";

    var defs = el("defs", {});
    svg.appendChild(defs);

    var rotor = el("g", { "data-spin-rotor": "" });
    svg.appendChild(rotor);

    var n = segments.length;
    var step = 360 / n;

    // Edges fade out around the hub rather than converging on a bright dot.
    var hubR = num(w, "data-spin-hub-radius", segR * 0.24, 0, segR);
    // Unique per render: several wheels (or a redraw) must not share gradient ids.
    var gradId = "fcspin-" + ++gradSeq;

    for (var i = 0; i < n; i++) {
      var seg = segments[i];
      var a0 = i * step;
      var a1 = (i + 1) * step;
      var mid = a0 + step / 2;

      /* A one-segment wheel would make the arc endpoints identical and the
         path collapse. The segment count is admin data, so handle it. */
      var shape =
        n === 1
          ? el("circle", { cx: CX, cy: CY, r: segR })
          : el("path", { d: sectorPath(segR, a0, a1) });
      shape.setAttribute(
        "fill",
        segmentFill(seg, i, n, glassStyle, fillA, fillB, tint)
      );
      shape.setAttribute("data-spin-segment", String(seg.index));
      if (seg.is_consolation) shape.setAttribute("data-spin-consolation", "");
      if (strokeColor && strokeWidth > 0) {
        shape.setAttribute("stroke", strokeColor);
        shape.setAttribute("stroke-width", strokeWidth);
        shape.setAttribute("stroke-linejoin", "round");
      }
      rotor.appendChild(shape);

      /* The lit edge. Each pane gets a hairline down its LEADING radial edge,
         brightest at the rim and fading to nothing at the hub — the way light
         catches the bevel of a real pane. Drawn per segment rather than as one
         divider grid so a pane still reads as a discrete object when the
         dividers themselves are turned off. */
      if (edge > 0) {
        var eOuter = polar(segR, a0);
        var eInner = polar(hubR, a0);
        var eg = el("linearGradient", {
          id: gradId + "-e" + i,
          gradientUnits: "userSpaceOnUse",
          x1: round(eOuter.x), y1: round(eOuter.y),
          x2: round(eInner.x), y2: round(eInner.y),
        });
        eg.appendChild(el("stop", { offset: "0", "stop-color": edgeColor, "stop-opacity": edge }));
        eg.appendChild(el("stop", { offset: "1", "stop-color": edgeColor, "stop-opacity": 0 }));
        defs.appendChild(eg);
        rotor.appendChild(
          el("line", {
            x1: round(eOuter.x), y1: round(eOuter.y),
            x2: round(eInner.x), y2: round(eInner.y),
            stroke: "url(#" + gradId + "-e" + i + ")",
            "stroke-width": edgeWidth,
            "stroke-linecap": "round",
            "data-spin-edge-line": String(i),
          })
        );
      }

      if (showIcons && seg.image_url) {
        var p = polar(Math.min(iconRadius, segR - iconSize / 2), mid);
        var img = el("image", {
          x: round(p.x - iconSize / 2),
          y: round(p.y - iconSize / 2),
          width: iconSize,
          height: iconSize,
          preserveAspectRatio: "xMidYMid meet",
          "data-spin-icon": String(seg.index),
        });
        // href works everywhere modern; xlink:href keeps older WebViews happy,
        // and store tablets are not always new.
        img.setAttribute("href", seg.image_url);
        img.setAttributeNS(XLINK_NS, "xlink:href", seg.image_url);
        rotor.appendChild(img);
      }

      if (showLabels && seg.label) {
        rotor.appendChild(
          labelNode(seg, mid, labelMode, labelSize, labelColor, labelRadius)
        );
      }
    }

    /* The rim band and its studs. Drawn last so they sit over the segment
       edges, and INSIDE the rotor so they turn with the wheel — the studs are
       the clearest read on how fast it is spinning. */
    if (rimBand > 0 && rimWidth > 0) {
      [segR, R].forEach(function (r) {
        var ring = el("circle", {
          cx: CX, cy: CY, r: r,
          fill: "none",
          stroke: rimStroke,
          "stroke-width": rimWidth,
          "data-spin-ring": "",
        });
        rotor.appendChild(ring);
      });
    }
    if (showStuds && rimBand > 0) {
      for (var k = 0; k < n; k++) {
        var sp = polar(studR, k * step);
        rotor.appendChild(
          el("circle", {
            cx: round(sp.x), cy: round(sp.y), r: studSize,
            fill: studFill,
            "data-spin-stud": String(k),
          })
        );
      }
    }

    /* The specular sheen. Deliberately OUTSIDE the rotor: it must NOT turn
       with the wheel. Light that rotates with an object reads as painted-on;
       light that stays put while the object turns underneath is what makes
       the whole disc read as glass. This one overlay does more for the effect
       than anything else in this function. */
    if (sheen > 0) {
      var lit = polar(segR, lightAngle);
      var dark = polar(segR, lightAngle + 180);
      var sg = el("linearGradient", {
        id: gradId + "-sheen",
        gradientUnits: "userSpaceOnUse",
        x1: round(lit.x), y1: round(lit.y),
        x2: round(dark.x), y2: round(dark.y),
      });
      sg.appendChild(el("stop", { offset: "0", "stop-color": "#ffffff", "stop-opacity": sheen }));
      sg.appendChild(el("stop", { offset: "0.5", "stop-color": "#ffffff", "stop-opacity": sheen * 0.18 }));
      sg.appendChild(el("stop", { offset: "1", "stop-color": "#ffffff", "stop-opacity": 0 }));
      defs.appendChild(sg);
      svg.appendChild(
        el("circle", {
          cx: CX, cy: CY, r: segR,
          fill: "url(#" + gradId + "-sheen)",
          "data-spin-sheen-layer": "",
          "pointer-events": "none",
        })
      );
    }

    /* Single source of truth for where the pointer is. The landing maths uses
       data-spin-pointer-angle; the pointer you can SEE is positioned in CSS.
       Publishing the angle as a custom property means the two cannot drift
       apart — the CSS just rotates by var(--fc-pointer-angle). Set the
       attribute and the marker follows. */
    if (state.wrap)
      state.wrap.style.setProperty("--fc-pointer-angle", pointerAngle() + "deg");

    clearWheelBox(box);
    box.appendChild(svg);
    state.rotor = rotor;

    // Rotate about the wheel's centre in the SVG's own user units — NOT the
    // element's bounding box, which for a <g> is only as big as its contents.
    if (window.gsap) window.gsap.set(rotor, { svgOrigin: CX + " " + CY });
    setRotation(0);
    return true;
  }

  /* Clear the wheel box of everything WE put there — and nothing else.

     `innerHTML = ""` would be the obvious way and it is wrong: when the canvas
     is a glass host, glass.js has parked its `.lg-layer` overlay inside it, and
     glass.js's attach() is ONE-WAY (it guards on an internal states map). Blow
     that node away and it is gone for good — a later LiquidGlass.scan() will
     look at the element, see it is already "attached", and return without
     rebuilding anything. The glass would silently lose its lighting layer on
     the first re-render.

     So: keep anything carrying a data-lg-* marker, drop the rest (which is our
     own previous <svg>). This is the same "mark what you inject" contract
     transition.js relies on — see CLAUDE.md. */
  function clearWheelBox(box) {
    var kids = Array.prototype.slice.call(box.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      if (kid.nodeType === 1 && hasGlassMarker(kid)) continue;
      box.removeChild(kid);
    }
  }
  function hasGlassMarker(node) {
    var a = node.attributes;
    if (!a) return false;
    for (var i = 0; i < a.length; i++)
      if (a[i].name.indexOf("data-lg-") === 0) return true;
    return false;
  }

  // Colours come from the admin. Anything that isn't a plain hex is refused
  // rather than written into the DOM.
  function validColor(c) {
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c || "")
      ? c
      : null;
  }

  // #abc / #aabbcc -> "r,g,b". Only ever called on a validColor() result.
  function hexRGB(hex) {
    var h = hex.replace("#", "").slice(0, 6);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ].join(",");
  }

  /* Solid style: the admin's colour, as authored.
     Glass style: two alternating translucent panes so neighbouring segments
     are still tellable apart, optionally tinted towards the admin's colour by
     data-spin-tint. An odd segment count would put two "A" panes side by side
     at the wrap-around, so the last one is forced to B. */
  function segmentFill(seg, i, n, glassStyle, fillA, fillB, tint) {
    var own = validColor(seg.color);
    if (!glassStyle) return own || "#2E7D32";
    if (tint > 0 && own) return "rgba(" + hexRGB(own) + "," + tint + ")";
    /* An ODD segment count makes the last pane and the first pane both "A",
       so they meet at the wrap-around as one undivided shape. The seven-slice
       wheel in the brief is exactly that case. Force the last one to B. */
    if (n % 2 === 1 && i === n - 1) return fillB;
    return i % 2 === 0 ? fillA : fillB;
  }

  /* Radial labels read from the hub outward and get the whole radius to play
     with, which is what short prize names need on a 7-slice wheel. On the
     left half they are flipped so they never appear upside down. Tangential
     is offered for wheels with very few, very short labels. */
  function labelNode(seg, mid, mode, size, color, labelRadius) {
    var t;
    if (mode === "tangential") {
      t = el("text", {
        x: CX,
        y: CY - labelRadius + size,
        "text-anchor": "middle",
        transform: "rotate(" + round(mid) + " " + CX + " " + CY + ")",
      });
    } else {
      var flip = mid > 180; // left half — read the other way round
      t = el("text", {
        x: flip ? CX - labelRadius : CX + labelRadius,
        y: CY,
        "text-anchor": flip ? "start" : "end",
        "dominant-baseline": "middle",
        transform:
          "rotate(" +
          round(flip ? mid + 90 : mid - 90) +
          " " +
          CX +
          " " +
          CY +
          ")",
      });
    }
    t.setAttribute("font-size", size);
    t.setAttribute("fill", color);
    t.setAttribute("data-spin-label", String(seg.index));
    t.style.pointerEvents = "none";
    t.textContent = seg.label; // TEXT — admin copy, never markup
    return t;
  }

  function setRotation(deg) {
    if (!state.rotor) return;
    if (window.gsap) window.gsap.set(state.rotor, { rotation: deg });
    else
      state.rotor.setAttribute(
        "transform",
        "rotate(" + round(deg) + " " + CX + " " + CY + ")"
      );
  }
  function currentRotation() {
    if (!state.rotor) return 0;
    if (window.gsap)
      return Number(window.gsap.getProperty(state.rotor, "rotation")) || 0;
    return 0;
  }

  /* ------------------------------ the spin ------------------------------ */

  function pointerAngle() {
    return num(state.wrap, "data-spin-pointer-angle", 0);
  }

  /* Where the rotor must end up for `index` to sit under the pointer.
     A segment's centre starts at (index + 0.5) * step; rotating the wheel by
     R moves it to centre + R, and we want that to equal the pointer angle. */
  function landingRotation(index, count) {
    var step = 360 / count;
    var centre = (index + 0.5) * step;
    var target = pointerAngle() - centre;
    return ((target % 360) + 360) % 360;
  }

  function startIdleSpin() {
    if (!state.rotor || !window.gsap) return;
    var perTurn = num(state.wrap, "data-spin-idle-turn", 1, 0.4);
    stopTweens();
    state.idleTween = window.gsap.to(state.rotor, {
      rotation: "+=360",
      duration: perTurn,
      ease: "none",
      repeat: -1,
      svgOrigin: CX + " " + CY,
    });
  }

  function stopTweens() {
    if (state.idleTween) {
      state.idleTween.kill();
      state.idleTween = null;
    }
    if (state.landTween) {
      state.landTween.kill();
      state.landTween = null;
    }
  }

  function land(index, count, done) {
    var turns = num(state.wrap, "data-spin-turns", 1, 0);
    var duration = num(state.wrap, "data-spin-duration", 1.5, 0.3);
    var target = landingRotation(index, count);

    if (!state.rotor || !window.gsap || reduced()) {
      stopTweens();
      setRotation(target);
      if (done) done();
      return;
    }

    var from = currentRotation();
    // Always forward, never backwards: normalise the current angle, then add
    // the whole turns on top so the deceleration reads as one continuous spin.
    var delta = ((target - from) % 360 + 360) % 360;
    var to = from + turns * 360 + delta;

    if (state.idleTween) {
      state.idleTween.kill();
      state.idleTween = null;
    }
    state.landTween = window.gsap.to(state.rotor, {
      rotation: to,
      duration: duration,
      ease: "power4.out",
      svgOrigin: CX + " " + CY,
      onComplete: function () {
        state.landTween = null;
        if (done) done();
      },
    });
  }

  function onSpin() {
    if (state.busy || state.mode !== "ready" || cooling()) return;
    if (state.demo) return demoSpin(); // dev only — never touches the API
    var id = FC.getSessionId();
    if (!id) return;

    state.busy = true;
    state.spinStartedAt = now();
    write("[data-spin-error]", "");
    setState("spinning");
    startIdleSpin();

    var token = state.token;
    var minSpin = num(state.wrap, "data-spin-min", 2, 0) * 1000;

    /* The header is what proves this spin is happening on the tablet that
       started the session. Without it the server cannot tell, and answers 403. */
    FC.api("/sessions/" + id + "/spin", { method: "POST", kiosk: true })
      .then(function (award) {
        if (!alive(token)) return;
        var waited = now() - state.spinStartedAt;
        var hold = Math.max(0, minSpin - waited);
        // Keep spinning until the minimum has elapsed. The response landing in
        // 200ms should still feel like a spin, not a flicker.
        setTimeout(function () {
          if (!alive(token)) return;
          state.busy = false;
          state.award = award;
          FC.award = award; // survives a Barba swap, like every other result
          var count = (state.segments && state.segments.length) || 0;
          var index = award && award.segment_index;
          if (count && typeof index === "number" && index >= 0 && index < count)
            land(index, count, function () {
              if (alive(token)) paintAward(award);
            });
          else {
            // The server named a segment this wheel doesn't have (a stale
            // wheel cached at boot, most likely). Don't fake a landing —
            // stop where we are and show the prize, which is the real result.
            stopTweens();
            paintAward(award);
          }
        }, hold);
      })
      .catch(function (err) {
        if (!alive(token)) return;
        state.busy = false;
        stopTweens(); // stop the wheel where it is — never land on an error
        handleSpinError(err);
      });
  }

  /* The §7.4 table, in order: branch on the status code first, then on the
     `detail` string where one code has several causes. */
  function handleSpinError(err) {
    var status = err && err.status;
    var detail = (err && (err.detail || err.message)) || "";
    dbg("spin failed", status, detail);

    if (status === 401) {
      // Revoked device. The kiosk module clears the token, drops the session
      // and shows the unpaired screen — nothing left for this page to do.
      if (FC.kiosk && FC.kiosk.unpair) FC.kiosk.unpair("401 on spin");
      showError(null, "disabled");
      return;
    }
    if (status === 403) {
      if (/disabled/i.test(detail)) {
        showError("This kiosk is temporarily unavailable.", "disabled");
        return;
      }
      showError(
        "Please spin on the tablet where you took the quiz.",
        "other-kiosk"
      );
      return;
    }
    if (status === 404) {
      // Unknown session — there is nothing to recover, start over.
      FC.resetJourney();
      go(attr(state.wrap, "data-spin-onboarding", "/onboarding"));
      return;
    }
    if (status === 409) {
      if (/already spun/i.test(detail)) {
        showError(
          "Looks like you've already spun — one reward per person.",
          "already-spun"
        );
        return;
      }
      if (/not completed/i.test(detail)) {
        go(attr(state.wrap, "data-spin-product", "/flexicare-product"));
        return;
      }
      if (/phone/i.test(detail)) {
        setState("nophone");
        return;
      }
      if (/in-store kiosk/i.test(detail)) {
        showError(null, "web");
        return;
      }
      showError(null, "unknown");
      return;
    }
    if (status === 429) {
      setState("ready"); // the CTA comes back when the countdown runs out
      startCooldown((err && err.retryAfter) || 60);
      return;
    }
    if (status === 503) {
      showError(null, "wheel");
      return;
    }
    showError(null, status ? "unknown" : "network");
  }

  /* ------------------------------ the award ------------------------------ */

  function paintAward(award) {
    if (!award) return;
    state.award = award;
    // A demo award is never persisted — it must not survive a Barba swap and
    // be mistaken for a real one on a later, genuine visit.
    if (!state.demo) FC.award = award;

    var prize = award.prize || {};
    var status = award.status || "AWARDED";
    var consolation = !!award.is_consolation;

    write("[data-spin-prize-name]", prize.name || prize.label || "");
    write("[data-spin-prize-label]", prize.label || prize.name || "");
    write("[data-spin-store]", (award.location && award.location.name) || "");

    var name = award.first_name || FC.firstName || "";
    write("[data-spin-name]", name);
    show("[data-spin-name-wrap]", !!name);

    /* instructions may be null — fall back to whatever the Designer authored
       in the element rather than blanking it. Captured once per element so a
       second paint doesn't fall back to the API copy from the first. */
    slots("[data-spin-instructions]").forEach(function (node) {
      if (node.__spinDefault == null) node.__spinDefault = node.textContent;
      node.textContent = award.instructions || node.__spinDefault || "";
    });


    /* The claim code is only meaningful while the award is claimable, and a
       consolation award must never emphasise it (every award has one, but
       there is nothing to collect). */
    var claimable = status === "AWARDED" && !consolation;
    write("[data-spin-claim]", claimable ? award.claim_code || "" : "");
    show("[data-spin-claim-wrap]", claimable && !!award.claim_code);

    var expires = award.expires_at ? formatExpiry(award.expires_at) : null;
    write("[data-spin-expires]", expires || "");
    show("[data-spin-expires-wrap]", !!expires && status === "AWARDED");

    if (status === "REDEEMED") setState("redeemed");
    else if (status === "EXPIRED") setState("expired");
    else if (status === "VOIDED") setState("voided");
    else setState(consolation ? "consolation" : "prize");

    dbg("award", {
      status: status,
      segment: award.segment_index,
      consolation: consolation,
    });
  }

  function formatExpiry(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var pretty;
    try {
      pretty = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {
      pretty = d.toDateString();
    }
    var fmt = attr(state.wrap, "data-spin-expires-format", "Claim by {date}");
    return fmt.replace("{date}", pretty);
  }

  /* ------------------------------ demo mode ------------------------------
     Everything below is dev-only and unreachable without ?spindemo. See the
     header comment for the rules it holds to. */

  function readDemoParam() {
    var raw = null;
    try {
      raw = new URL(location.href).searchParams.get("spindemo");
    } catch (e) {
      var m = /[?&]spindemo(?:=([^&]*))?/.exec(location.search || "");
      if (m) raw = m[1] == null ? "" : decodeURIComponent(m[1]);
    }
    if (raw === null) return null; // parameter absent → normal operation
    return (raw || "prize").toLowerCase();
  }

  function demoAward(kind) {
    var consolation = kind === "consolation";
    var status =
      kind === "redeemed"
        ? "REDEEMED"
        : kind === "expired"
        ? "EXPIRED"
        : kind === "voided"
        ? "VOIDED"
        : "AWARDED";
    return {
      award_id: "demo",
      prize: consolation
        ? { code: "TRY_AGAIN", name: "Try again next time", label: "Try again" }
        : { code: "WATER_BOTTLE", name: "Flexicare water bottle", label: "Water bottle" },
      segment_index: consolation ? 6 : 1,
      is_consolation: consolation,
      claim_code: "FLX-DEMO-CODE",
      status: status,
      expires_at: "2026-09-25T09:20:31Z",
      instructions: null, // exercise the authored-copy fallback
      location: { id: "demo", name: "Clicks Sandton City", code: "demo" },
      first_name: FC.firstName || "Thandi",
    };
  }

  function startDemo(token) {
    var kind = state.demo;
    state.wrap.setAttribute("data-spin-demo", kind);
    if (window.console)
      console.warn(
        "[spin] ?spindemo is ON (" +
          kind +
          "). The session is skipped, POST /spin is NEVER called and no award " +
          "is created. Remove the parameter for real testing."
      );

    // Panels that don't involve the wheel at all — jump straight there.
    if (kind === "nophone") return setState("nophone");
    if (kind === "unavailable" || kind === "error")
      return showError(null, "wheel");
    if (kind === "consolation" || kind === "redeemed" || kind === "expired" || kind === "voided")
      return paintAward(demoAward(kind));

    loadWheel()
      .catch(function () {
        if (window.console)
          console.warn("[spin] demo: /prizes/wheel unreachable — placeholder segments.");
        return DEMO_SEGMENTS;
      })
      .then(function (segments) {
        if (!alive(token)) return;
        state.segments = segments && segments.length ? segments : DEMO_SEGMENTS;
        if (!renderWheel(state.segments)) return showError(null, "wheel");
        setState("ready");
      });
  }

  // The ONLY place a segment is ever chosen client-side, and it exists purely
  // so the deceleration can be watched without a backend. The real spin takes
  // segment_index from the server and nothing else.
  function demoSpin() {
    var count = (state.segments && state.segments.length) || 0;
    if (!count) return;
    var index = Math.floor(Math.random() * count);
    var seg = state.segments[index];
    var a = demoAward(seg && seg.is_consolation ? "consolation" : "prize");
    a.segment_index = index;
    if (seg) {
      a.prize = { code: seg.code, name: seg.label, label: seg.label };
      a.is_consolation = !!seg.is_consolation;
    }
    setState("spinning");
    startIdleSpin();
    var token = state.token;
    setTimeout(function () {
      if (!alive(token)) return;
      land(index, count, function () {
        if (alive(token)) paintAward(a);
      });
    }, num(state.wrap, "data-spin-min", 2, 0) * 1000);
  }

  /* ------------------------------- loading ------------------------------- */

  function loadWheel() {
    // Public, session-less, and it only changes when an admin edits prize
    // types — but the icon URLs are presigned and expire in ~10 minutes, so
    // it is fetched when the spin screen is shown rather than cached at boot.
    return FC.api("/prizes/wheel").then(function (res) {
      var segs = (res && res.segments) || [];
      segs = segs.slice().sort(function (a, b) {
        return (a.index || 0) - (b.index || 0);
      });
      return segs;
    });
  }

  function loadSession(id) {
    return FC.api("/sessions/" + id);
  }

  function start(token) {
    var id = FC.getSessionId();
    if (!id) {
      dbg("no session id — bouncing to onboarding");
      go(attr(state.wrap, "data-spin-onboarding", "/onboarding"));
      return;
    }

    loadSession(id)
      .then(function (session) {
        if (!alive(token)) return null;
        state.session = session;
        if (session && session.first_name) FC.setFirstName(session.first_name);
        write("[data-spin-store]", (session.location && session.location.name) || "");

        if (session.status !== "COMPLETED") {
          // They haven't finished the quiz — the spin is not reachable yet.
          go(attr(state.wrap, "data-spin-product", "/flexicare-product"));
          return null;
        }
        if (session.channel !== "KIOSK") {
          // A web session can never spin. Say so up front rather than letting
          // someone tap a wheel that is guaranteed to 409.
          showError(null, "web");
          return null;
        }
        if (session.has_prize) {
          // Already spun. The award is the truth; never offer a second spin.
          return FC.api("/sessions/" + id + "/prize").then(function (award) {
            if (!alive(token)) return null;
            paintAward(award);
            return null;
          });
        }
        if (!session.phone_number) {
          // Onboarding normally captures this, so reaching here means it
          // failed silently back then. The panel sends them back for it.
          setState("nophone");
          return null;
        }
        return loadWheel();
      })
      .then(function (segments) {
        if (!alive(token) || !segments) return;
        state.segments = segments;
        if (!segments.length) {
          showError(null, "wheel");
          return;
        }
        if (!renderWheel(segments)) {
          showError(null, "wheel");
          return;
        }
        setState("ready");
      })
      .catch(function (err) {
        if (!alive(token)) return;
        if (err && err.status === 404) {
          // Either the session is gone or (from /prize) it never spun — the
          // session lookup above already succeeded, so this is the former.
          FC.resetJourney();
          go(attr(state.wrap, "data-spin-onboarding", "/onboarding"));
          return;
        }
        if (err && err.status === 503) {
          showError(null, "wheel");
          return;
        }
        dbg("load failed", err && err.message);
        showError(null, err && err.status ? "unknown" : "network");
      });
  }

  /* ------------------------ delegated listeners ------------------------ */

  function onClick(e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function" || !state.wrap) return;

    var goBtn = t.closest("[data-spin-go]");
    if (goBtn) {
      e.preventDefault();
      onSpin();
      return;
    }

    var doneBtn = t.closest("[data-spin-done]");
    if (doneBtn) {
      e.preventDefault();
      go(attr(doneBtn, "data-spin-done", null) || realHref(doneBtn) || "/");
      return;
    }

    var backBtn = t.closest("[data-spin-back]");
    if (backBtn) {
      e.preventDefault();
      var url = attr(backBtn, "data-spin-back", null) || realHref(backBtn);
      if (url) go(url);
      else if (window.history && window.history.length > 1)
        window.history.back();
      return;
    }
  }
  document.addEventListener("click", onClick);

  /* --------------------------- init / teardown --------------------------- */

  function resolveWrap(scope) {
    scope = scope || document;
    if (scope.matches && scope.matches("[data-spin]")) return scope;
    var found = scope.querySelector && scope.querySelector("[data-spin]");
    if (found) return found;
    if (scope === document) return document.querySelector("[data-spin]");

    /* No document-wide fallback during a swap: the OUTGOING container is still
       in the DOM and falling back to it initialises this controller on the
       page we just left. That exact bug hit the quiz and reveal pages. */
    var stray = document.querySelector("[data-spin]");
    if (stray && !(stray.closest && stray.closest('[data-barba="container"]')))
      console.warn(
        '[spin] [data-spin] is outside data-barba="container", so Barba never ' +
          "brings it across on a navigation. Move it INSIDE the container."
      );
    return null;
  }

  function init(scope) {
    var wrap = resolveWrap(scope);
    if (!wrap) return; // not the spin page
    if (state.wrap === wrap) return; // already initialised

    var token = ++state.token;
    state.wrap = wrap;
    state.demo = readDemoParam();
    state.debug = wrap.hasAttribute("data-spin-debug") || !!state.demo;
    state.segments = null;
    state.session = null;
    state.award = null;
    state.rotor = null;
    state.busy = false;
    stopTweens();
    stopCooldown();

    captureDefaults(); // BEFORE anything can blank the authored copy
    setState("loading");

    if (state.demo) return startDemo(token);

    /* Re-entering after a spin (back, then forward again): FC.award survives
       the swap, so re-show it without another round trip. The server would
       return the same award anyway — this just avoids the flicker. */
    if (FC.award) {
      paintAward(FC.award);
      return;
    }
    start(token);
  }

  function teardown() {
    stopTweens();
    stopCooldown();
    state.token++; // invalidate anything still in flight
    if (state.wrap) {
      state.wrap.removeAttribute("data-spin-state");
      state.wrap.removeAttribute("data-spin-reason");
      state.wrap.removeAttribute("data-spin-demo");
    }
    state.demo = null;
    var root = document.documentElement;
    if (root) root.removeAttribute("data-spin-state");
    state.wrap = null;
    state.segments = null;
    state.session = null;
    state.rotor = null;
    state.busy = false;
    state.mode = null;
  }

  /* ------------------------------ dev hook ------------------------------
     Tear down and re-initialise in place. Used by demo/spin.html so the
     tuner can re-render the wheel after changing a rendering attribute
     (labels, stroke, icons) without a page reload, and to get back to
     "ready" for another demo spin.

     Public for the same reason LiquidGlass.scan() is: it is the honest way
     to say "the DOM changed under you, look again". Nothing in the funnel
     calls it — the Barba hooks below do that job in production. */
  FC.spin = FC.spin || {};
  FC.spin.reinit = function () {
    teardown();
    init(document);
  };

  /* ------------------------------ lifecycle ------------------------------ */

  if (window.barba && window.barba.hooks) {
    window.barba.hooks.afterEnter(function (data) {
      init((data && data.next && data.next.container) || document);
    });
    window.barba.hooks.beforeLeave(function () {
      if (state.wrap) teardown();
    });
  }
  window.addEventListener("pagehide", teardown);

  function boot() {
    init(document);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
