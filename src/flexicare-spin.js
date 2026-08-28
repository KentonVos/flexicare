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
                                  data-spin-lead-label="Submit"  what the CTA
                                     says while the lead form is up; it reverts
                                     to its authored text afterwards
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
                                  data-spin-nav-hide="on|off"  whether tapping
                                     spin collapses the nav wrapper. Default on.
                                     The spin CTA lives in the nav, so once the
                                     wheel is turning the nav is spent — it
                                     slides away with the SAME gesture the
                                     landing page uses (PageTransition.nav,
                                     which needs [data-nav-reveal] on the
                                     wrapper), and stays away, because the next
                                     step is going home where it is collapsed
                                     anyway. It returns only if the state goes
                                     back to `ready` — i.e. the spin did not
                                     take — since otherwise the shopper is left
                                     with a wheel they cannot tap.
                                  data-spin-debug         console logging

                                PANEL MOTION (the wheel out, the card in —
                                see the PANELS note below):
                                  data-spin-panel-in="0.45"   seconds
                                  data-spin-panel-out="0.28"  seconds
                                  data-spin-panel-overlap="0" seconds the
                                     incoming panel starts BEFORE the outgoing
                                     one finishes. 0 = strictly sequential,
                                     which is the only safe default when the
                                     panels are siblings in normal flow. Raise
                                     it for a cross-fade — but only once the
                                     panels are STACKED (same grid cell, or
                                     absolutely positioned), or for that
                                     overlap both are in the layout at once
                                     and the page jumps.
                                  data-spin-panel-scale="0.94"  the in starts
                                     here, the out ends here.
                                  data-spin-panel-scale-out    override for the
                                     exit; defaults to -panel-scale.
                                  data-spin-panel-ease="power2.out"
                                  data-spin-panel-ease-out="power2.in"
                                  (all of it skipped under
                                   prefers-reduced-motion, and on the first
                                   paint of the page — there is nothing to
                                   cross-fade from, and it would fight the
                                   Barba entrance)

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
                                It does NOT have to sit inside the stage, or
                                even inside [data-spin] — clicks are delegated
                                from `document`, so a button in a nav bar works
                                anywhere on the page, including the persistent
                                shell outside data-barba="container".
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

                                The swap is ANIMATED: the outgoing panel scales
                                and fades out, the incoming one scales and fades
                                in (data-spin-panel-* above). Two consequences
                                worth knowing:

                                • A panel that is ALSO a glass host fades
                                  without scaling — glass owns `transform` and
                                  its press spring would wipe the tween. For the
                                  scale, make the panel a plain wrapper and put
                                  data-liquid-glass on the card inside it.
                                • NESTED panels (the message card lists six
                                  states, each block inside it lists one) do not
                                  animate when their parent panel is also
                                  changing — the outermost one carries the
                                  motion, or the fades multiply. A block whose
                                  parent is staying put still animates.

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
     [data-spin-go-text]        Optional, on the INNER text element of the CTA
                                (Webflow buttons wrap their label in a div).
                                Marks what gets relabelled in state "form".
                                Without it the button's own text is used.

     THE LEAD FORM — gates the wheel (state "form", before "ready"):
     Put all of this inside a [data-spin-when="form"] panel. The wheel is
     already rendered behind it, so submitting only flips the state.

     [data-spin-lead-name]      <input>. Prefilled from session.first_name.
     [data-spin-lead-surname]   <input>.
     [data-spin-lead-phone]     <input>. Prefilled from session.phone_number.
                                Normalised to E.164 before sending.
     [data-spin-lead-email]     <input>. Prefilled from session.email.
     [data-spin-lead-idtype]    The ID/Passport choice. Put it on BOTH options
                                with data-spin-lead-idtype="id" / "passport" —
                                plain WEBFLOW DIVS work great here, exactly like
                                the onboarding gender pills. The selected one
                                gets a class toggled on it + aria-checked. The
                                class defaults to `is-selected`; override it per
                                element with:
                                  data-selected-class="YourComboClass"
                                To keep the whole row clickable but put the class
                                on an INNER element (the styled dot, say), add:
                                  data-selected-target="<css selector>"
                                A native <input type="radio"> is synced too, if
                                you would rather have one. Defaults to "id".
     [data-spin-lead-idnumber]  <input>. Validated as 13 digits for "id", or
                                6–20 alphanumerics for "passport".
     [data-spin-lead-submit]    A dedicated submit button, if you want one.
                                NOT required: in state "form" the main
                                [data-spin-go] CTA doubles as the submit and
                                relabels itself, which is how /spin-to-win is
                                built (its CTA lives in the nav, so a second
                                button there would be awkward). Disabled while
                                the request is in flight.
     [data-spin-lead-error]     Message box. Written as TEXT. Hidden when empty.
     [data-spin-lead-idlabel]   Optional. Its text follows the chosen type
                                ("ID number" / "Passport number").

     WHAT ACTUALLY REACHES THE BACKEND, AND WHAT DOES NOT
       Only two of these fields have an endpoint today:
         phone → PATCH /sessions/{id}/contact/phone
         email → PATCH /sessions/{id}/contact/email
       name, surname, id_type and id_number have NO endpoint in the API
       contract (checked 2026-08-28 — the words do not appear in it). They are
       buffered on Flexicare.lead, in memory, and are LOST on a hard reload.
       This is deliberate and temporary: the form was built ahead of the
       backend so the page could ship. When the endpoints land, send them from
       submitLead() and delete this paragraph.

   STATE (drive your CSS and your panels off this — set on the wrapper AND
   on <html>, so a full-bleed background can react too):
     data-spin-state = "loading"      resolving the session + the wheel
                     | "form"         the lead form must be completed first
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
     ?spindemo=form           → …the lead form, wheel behind it
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
    rotor: null, // the back <g> (panes); kept for convenience
    rotors: null, // BOTH spinning groups — panes and content. Tweened together.
    idleTween: null,
    landTween: null,
    spinStartedAt: 0,
    waitTimer: null, // fires only if the API is slow — see onSpin
    busy: false, // a spin request is in flight
    mode: null, // current data-spin-state
    wheelReq: null, // in-flight GET /prizes/wheel
    cooldownTimer: null,
    cooldownUntil: 0,
    debug: false,
    demo: null, // ?spindemo — dev only; see the header comment
    needLead: false, // must the lead form be completed before "ready"?
    leadBusy: false, // a lead submit is in flight
    leadType: "id", // "id" | "passport" — which document was chosen
    painted: false, // has applyWhen run once? gates the panel animation
    navHidden: false, // did WE collapse the nav? gates putting it back
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
    var container = null;
    if (state.wrap) {
      roots.push(state.wrap);
      container =
        state.wrap.closest && state.wrap.closest('[data-barba="container"]');
      if (container && container !== state.wrap) roots.push(container);
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

    /* Last resort: the PERSISTENT SHELL. A spin button living in a nav bar is
       a perfectly reasonable place for it, and a nav bar is often outside
       data-barba="container" — in which case nothing above would ever find it
       and it would never get its disabled state.

       Anything matched here is filtered to nodes outside EVERY barba
       container, which is what keeps the old bug away: during a swap both
       containers are in the DOM, and a bare document-wide lookup can return
       the outgoing page's copy. Shell elements are not duplicated that way. */
    if (!out.length && state.wrap) {
      var strays = document.querySelectorAll(sel);
      for (var k = 0; k < strays.length; k++) {
        var st = strays[k];
        if (!attached(st)) continue;
        if (st.closest && st.closest('[data-barba="container"]')) continue;
        out.push(st);
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
    // The first paint of a page has nothing to cross-fade from, and it would
    // fight the Barba entrance animation. Every state change after it animates.
    var animate = state.painted;
    applyWhen(animate);
    state.painted = true;
    syncNav(mode, animate);
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

  function applyWhen(animate) {
    var panels = slots("[data-spin-when]");
    var items = [];
    var i, j;
    for (i = 0; i < panels.length; i++) {
      var el = panels[i];
      var list = (attr(el, "data-spin-when", "") + "").split(/\s+/);
      var on = false;
      for (j = 0; j < list.length; j++)
        if (list[j] && list[j] === state.mode) on = true;
      items.push({ el: el, on: on, changed: el.__spinOn !== on });
      el.__spinOn = on;
    }

    /* The hard path: the first paint of a page (nothing to cross-fade FROM),
       no GSAP, or a shopper who asked for reduced motion. Also the safety
       net — every animated path ends by clearing the same inline styles this
       resets, so a state change that arrives mid-tween lands cleanly. */
    var motion = animate && window.gsap && !reduced();
    if (!motion) {
      dbg(
        "panels → " + state.mode + " (no motion:",
        !animate ? "first paint" : !window.gsap ? "no gsap" : "reduced motion",
        ")"
      );
      for (i = 0; i < items.length; i++) {
        resetPanel(items[i].el);
        items[i].el.style.display = items[i].on ? "" : "none";
      }
      return;
    }

    var cfg = panelCfg();

    /* Nested panels: the message card lists six states and each block inside
       it lists one, so a spin landing on `consolation` changes BOTH. Animating
       both multiplies the fades and compounds the scales, so the OUTERMOST
       changing panel carries the motion and its children just toggle. A child
       whose parent is staying put (redeemed → expired inside the same card)
       still animates — that is the case worth having. */
    function ancestorChanging(node) {
      var p = node.parentNode;
      while (p && p.nodeType === 1 && p !== state.wrap) {
        if (p.hasAttribute("data-spin-when")) {
          for (var k = 0; k < items.length; k++)
            if (items[k].el === p) return items[k].changed;
          return false;
        }
        p = p.parentNode;
      }
      return false;
    }

    /* The incoming panel waits for the outgoing one unless there is nothing
       leaving (the very first card after `loading`, say) — otherwise a state
       change with no exit would sit doing nothing for outDur. */
    var leaving = false;
    for (i = 0; i < items.length; i++)
      if (items[i].changed && !items[i].on && !ancestorChanging(items[i].el))
        leaving = true;
    var delay = leaving ? Math.max(0, cfg.outDur - cfg.overlap) : 0;

    for (i = 0; i < items.length; i++) animatePanel(items[i], cfg, delay, ancestorChanging);
  }

  /* --------------------------- panel motion ---------------------------
     The wheel and the result cards are panels on ONE page, so there is no
     Barba transition to ride: the swap between them is a scale + opacity
     cross-dissolve run from here.

     GLASS HOSTS GET OPACITY ONLY. glass.js writes el.style.transform in its
     press spring and resets it to the transform captured at attach — which
     would wipe a scale tween mid-flight. So a panel carrying
     data-liquid-glass fades without scaling, and the console says so once.
     Want the scale: put the panel on a plain wrapper and the glass on the
     card inside it. Scaling a wrapper is safe — an affine deform transforms
     the finished glass rendering, rim and displacement map as one unit.
     (What is never safe is animating border-radius. See CLAUDE.md.) */

  function isGlassHost(el) {
    return !!(el && el.hasAttribute && el.hasAttribute("data-liquid-glass"));
  }

  function panelCfg() {
    var w = state.wrap;
    var scale = num(w, "data-spin-panel-scale", 0.94, 0.2, 2);
    return {
      inDur: num(w, "data-spin-panel-in", 0.45, 0),
      outDur: num(w, "data-spin-panel-out", 0.28, 0),
      overlap: num(w, "data-spin-panel-overlap", 0, 0),
      scaleIn: scale,
      scaleOut: num(w, "data-spin-panel-scale-out", scale, 0.2, 2),
      easeIn: attr(w, "data-spin-panel-ease", "power2.out"),
      easeOut: attr(w, "data-spin-panel-ease-out", "power2.in"),
    };
  }

  // Everything the tweens touch, taken back off the element. Inline styles
  // left behind by a killed tween are how a panel ends up stuck at 40%
  // opacity three states later.
  function resetPanel(el) {
    if (!el) return;
    if (window.gsap) window.gsap.killTweensOf(el);
    el.style.opacity = "";
    el.style.transform = "";
    el.style.willChange = "";
  }

  function animatePanel(item, cfg, delay, ancestorChanging) {
    var el = item.el;
    if (!item.changed) return;

    // A child of a panel that is itself changing: no motion of its own.
    if (ancestorChanging(el)) {
      dbg("panel skip", attr(el, "data-spin-when", "?"), "— parent panel carries the motion");
      resetPanel(el);
      el.style.display = item.on ? "" : "none";
      return;
    }

    var flat = isGlassHost(el);
    dbg(
      (item.on ? "panel IN  " : "panel OUT ") + attr(el, "data-spin-when", "?"),
      flat ? "(glass host — opacity only)" : "(scale + opacity)"
    );
    if (flat && !el.__spinGlassWarned) {
      el.__spinGlassWarned = true;
      if (window.console)
        console.warn(
          "[spin] [data-spin-when] panel also has data-liquid-glass, so it " +
            "fades without scaling — glass owns transform. For the scale, " +
            "make the panel a plain wrapper and put the glass on the card inside."
        );
    }

    window.gsap.killTweensOf(el);

    if (item.on) {
      el.style.display = "";
      var from = { opacity: 0 };
      var to = {
        opacity: 1,
        duration: cfg.inDur,
        ease: cfg.easeIn,
        delay: delay,
        onComplete: function () {
          // Hand the element back to CSS — and to the glass press spring.
          resetPanel(el);
        },
      };
      if (!flat) {
        from.scale = cfg.scaleIn;
        to.scale = 1;
      }
      window.gsap.fromTo(el, from, to);
      return;
    }

    var out = {
      opacity: 0,
      duration: cfg.outDur,
      ease: cfg.easeOut,
      onComplete: function () {
        el.style.display = "none";
        resetPanel(el);
      },
    };
    if (!flat) out.scale = cfg.scaleOut;
    window.gsap.to(el, out);
  }

  /* ------------------------------- the nav -------------------------------
     The spin CTA lives in the nav wrapper, so the nav has exactly one job on
     this page. The moment the wheel starts turning that job is done — and the
     next step is going home, where the nav is collapsed anyway. So it slides
     away with the same gesture the landing page uses, which makes the two
     reads as one flow rather than two unrelated animations.

     We do NOT own the nav, we borrow it: PageTransition.nav wraps the same
     navReveal() the namespace path uses, so `__navHidden` stays truthful and
     the navigation that follows doesn't collapse or reopen it a second time.
     For the same reason we never put it back on teardown — leaving it hidden
     is what makes the trip to the landing page seamless.

     It comes back in exactly one case: the state returns to `ready` after we
     hid it, meaning the spin did NOT take (a 429 cooldown, a retryable
     network error). The CTA is inside the nav, so without this the shopper is
     left looking at a wheel they cannot tap.

     Opt out with data-spin-nav-hide="off" on [data-spin]. */
  function syncNav(mode, animate) {
    if (attr(state.wrap, "data-spin-nav-hide", "on") === "off") return;
    var pt = window.PageTransition;
    if (!pt || !pt.nav) return;

    // `loading`, `form` and `ready` are the states where spinning is still
    // ahead of the shopper. Everything else — spinning, every award state,
    // every dead end — is past it. `form` MUST be in this list: the spin CTA
    // lives in the nav, and collapsing it here is not reversible.
    var needed = mode === "loading" || mode === "form" || mode === "ready";

    if (!needed) {
      if (state.navHidden) return;
      state.navHidden = true;
      // On the FIRST paint (a reload that recovers an award, a web session
      // refused up front) collapse it instantly: animating here would open
      // the nav with the page entrance and immediately close it again.
      pt.nav.hide(!animate);
      dbg("nav → hidden", animate ? "" : "(instant)");
      return;
    }
    if (mode === "ready" && state.navHidden) {
      state.navHidden = false;
      pt.nav.show(!animate);
      dbg("nav → shown (the spin did not take)");
    }
  }

  /* The CTA's text lives in an inner element on a Webflow button
     (.primary-button-text and friends), so mark it with data-spin-go-text and
     the label is swapped there. Without the marker we fall back to the button
     itself, which is right for a bare <button>Spin</button>. */
  function goTextNode(btn) {
    return (btn.querySelector && btn.querySelector("[data-spin-go-text]")) || btn;
  }

  /* ONE button for two jobs. In state "form" the CTA is the form's submit —
     it is the only primary button on the page and it lives in the nav, so a
     second one would be both redundant and awkward to place. It relabels
     itself, and reverts the moment the form is accepted. */
  function refreshButton() {
    var btn = slot("[data-spin-go]");
    if (!btn) return;
    var submitting = state.mode === "form";
    var enabled = submitting
      ? !state.leadBusy
      : state.mode === "ready" && !state.busy && !cooling();
    btn.disabled = !enabled;
    btn.setAttribute("aria-disabled", enabled ? "false" : "true");
    btn.setAttribute("data-spin-busy", (state.busy || state.leadBusy) ? "true" : "false");
    btn.setAttribute("data-spin-go-mode", submitting ? "submit" : "spin");

    // Captured lazily but BEFORE the first swap: every state change calls
    // this, and the first one (loading) is not the form.
    var node = goTextNode(btn);
    if (node.__spinGoDefault == null) node.__spinGoDefault = node.textContent;
    var next = submitting
      ? attr(state.wrap, "data-spin-lead-label", "Submit")
      : node.__spinGoDefault;
    if (node.textContent !== next) node.textContent = next;
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
    auditLayout(box);

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

    /* TWO rotating groups, not one, with the fixed sheen sandwiched between:

         rotor       panes, lit edges, rim, studs      ← the material
         sheen                                          ← fixed specular
         contentRotor  labels and icons                 ← the content

       SVG paints in document order, so a sheen drawn after a single rotor
       lands on top of the labels and veils them. Invisible at a gentle
       setting, a heavy white wash over white type at a strong one. Splitting
       the rotor keeps the specular above the glass and the text above the
       specular. Both groups carry the same rotation and are tweened together. */
    var rotor = el("g", { "data-spin-rotor": "" });
    svg.appendChild(rotor);

    var n = segments.length;
    var step = 360 / n;

    // Edges fade out around the hub rather than converging on a bright dot.
    var hubR = num(w, "data-spin-hub-radius", segR * 0.24, 0, segR);
    // Unique per render: several wheels (or a redraw) must not share gradient ids.
    var gradId = "fcspin-" + ++gradSeq;

    // Built now, appended AFTER the sheen (see the note on the rotor above).
    var contentRotor = el("g", { "data-spin-rotor": "" });

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
        contentRotor.appendChild(img); // above the sheen — never washed out
      }

      if (showLabels && seg.label) {
        contentRotor.appendChild(
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

    // Labels and icons last, so nothing paints over them.
    svg.appendChild(contentRotor);

    /* Single source of truth for where the pointer is. The landing maths uses
       data-spin-pointer-angle; the pointer you can SEE is positioned in CSS.
       Publishing the angle as a custom property means the two cannot drift
       apart — the CSS just rotates by var(--fc-pointer-angle). Set the
       attribute and the marker follows. */
    if (state.wrap)
      state.wrap.style.setProperty("--fc-pointer-angle", pointerAngle() + "deg");

    clearWheelBox(box);
    box.appendChild(svg);
    state.rotor = rotor; // kept for callers that just need "a" rotor
    state.rotors = [rotor, contentRotor];

    // Rotate about the wheel's centre in the SVG's own user units — NOT the
    // element's bounding box, which for a <g> is only as big as its contents.
    if (window.gsap) window.gsap.set(state.rotors, { svgOrigin: CX + " " + CY });
    setRotation(0);
    return true;
  }

  /* ------------------------- layout audit -------------------------
     Runs on every render when data-spin-debug is on. Building this page by
     hand in Webflow means five elements have to be positioned relative to one
     another, and when one of them is wrong the symptom is visual and the
     cause is not — a dial parked at the bottom of the page and an invisible
     pointer look like script bugs and are almost always a CSS box.

     So rather than guess from a screenshot: measure the boxes, say which
     ones are wrong, and name the fix. */
  function auditLayout(box) {
    if (!state.debug || !window.console) return;

    var stage = box.parentNode;
    var wrapEl = state.wrap;
    var hub = wrapEl && wrapEl.querySelector("[data-spin-hub]");
    var marker = wrapEl && wrapEl.querySelector("[data-spin-marker]");
    var pointer = wrapEl && wrapEl.querySelector("[data-spin-pointer]");

    function box2(el) {
      if (!el) return null;
      var r = el.getBoundingClientRect();
      var cs = window.getComputedStyle(el);
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        position: cs.position,
        display: cs.display,
        z: cs.zIndex,
      };
    }

    var rows = {
      "[data-spin-stage]": box2(stage),
      "[data-spin-wheel]": box2(box),
      "[data-spin-hub]": box2(hub),
      "[data-spin-marker]": box2(marker),
      "[data-spin-pointer]": box2(pointer),
    };
    dbg("layout", rows);

    var problems = [];

    // The stage must be a positioned, square box — everything else is
    // absolutely positioned against it.
    if (stage) {
      var sc = window.getComputedStyle(stage);
      if (sc.position === "static")
        problems.push(
          "[data-spin-stage] is position:static, so the dial, marker and " +
            "wheel are positioning against the PAGE instead of the stage. " +
            "It needs position:relative (the embed sets this — is " +
            "spin-webflow-embed.html on the page?)."
        );
      var sr = stage.getBoundingClientRect();
      if (sr.width && sr.height && Math.abs(sr.width - sr.height) / Math.max(sr.width, sr.height) > 0.02)
        problems.push(
          "[data-spin-stage] is " + Math.round(sr.width) + "x" + Math.round(sr.height) +
            " — not square. A parent using flex/grid can stretch it and " +
            "override aspect-ratio; try align-self:center on the stage, or " +
            "set an explicit height."
        );
    }

    // A dial that is not absolutely positioned falls into normal flow and
    // ends up below the wheel instead of on top of it.
    if (hub && window.getComputedStyle(hub).position === "static")
      problems.push(
        "[data-spin-hub] is position:static, so it sits BELOW the wheel in " +
          "normal flow instead of on top of it. Give it position:absolute, " +
          "left:50%, top:50%, transform:translate(-50%,-50%)."
      );

    // The single most common Webflow miss: an empty pointer div.
    if (pointer) {
      var pr = pointer.getBoundingClientRect();
      if (!pr.width || !pr.height)
        problems.push(
          "[data-spin-pointer] has no size (" + Math.round(pr.width) + "x" +
            Math.round(pr.height) + "), so there is nothing to see. The embed " +
            "deliberately does NOT style your pointer graphic — give it a " +
            "width, a height and a background in the Designer."
        );
    } else if (marker) {
      problems.push("[data-spin-marker] has no [data-spin-pointer] inside it.");
    }

    if (marker && window.getComputedStyle(marker).position === "static")
      problems.push(
        "[data-spin-marker] is position:static — it must be a FULL-SIZE " +
          "absolutely positioned box (position:absolute; inset:0) or " +
          "rotating it will not swing the pointer around the rim."
      );

    for (var i = 0; i < problems.length; i++)
      console.warn("[spin] layout: " + problems[i]);
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
    if (!state.rotors || !state.rotors.length) return;
    if (window.gsap) window.gsap.set(state.rotors, { rotation: deg });
    else
      for (var i = 0; i < state.rotors.length; i++)
        state.rotors[i].setAttribute(
          "transform",
          "rotate(" + round(deg) + " " + CX + " " + CY + ")"
        );
  }
  function currentRotation() {
    if (!state.rotors || !state.rotors.length || !window.gsap) return 0;
    return Number(window.gsap.getProperty(state.rotors[0], "rotation")) || 0;
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
    if (!state.rotors || !state.rotors.length || !window.gsap) return;
    var perTurn = num(state.wrap, "data-spin-idle-turn", 1, 0.4);
    stopTweens();
    // One tween, both groups — they must never drift apart by a frame or the
    // labels would visibly lag the panes they belong to.
    state.idleTween = window.gsap.to(state.rotors, {
      rotation: "+=360",
      duration: perTurn,
      ease: "none",
      repeat: -1,
      svgOrigin: CX + " " + CY,
    });
  }

  function stopTweens() {
    clearWait();
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
    var w = state.wrap;
    var turns = num(w, "data-spin-turns", 3, 0);
    var duration = num(w, "data-spin-duration", 3, 0.3);
    var target = landingRotation(index, count);

    /* ONE motion, or a deceleration — decided by whether the wheel is already
       turning.

       Normally it is not: we wait for the server's answer (a few hundred ms)
       and then run a single ease-in-out that winds up and settles in one
       gesture. That is the whole animation.

       If the request was slow enough that we fell back to spinning while we
       waited (see onSpin), starting an ease-IN-out from a moving wheel would
       brake it to a stop and then accelerate again — a visible hitch. So in
       that case we only decelerate, which is the physically correct
       continuation of a wheel already in motion. */
    var ease = state.idleTween
      ? attr(w, "data-spin-ease-out", "power4.out")
      : attr(w, "data-spin-ease", "power2.inOut");

    if (!state.rotors || !state.rotors.length || !window.gsap || reduced()) {
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
    state.landTween = window.gsap.to(state.rotors, {
      rotation: to,
      duration: duration,
      ease: ease,
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

    var token = state.token;

    /* We deliberately do NOT start the wheel here.

       A single speed-up-and-slow-down has to know where it ends before it
       begins, so the good case is: ask the server, get an answer in a few
       hundred milliseconds, then run one uninterrupted 3s gesture. Starting
       first and retargeting later is what produces the two-part motion this
       replaced — a flat spin, then a separate braking phase.

       The exception is a slow answer. After data-spin-wait we start turning
       anyway rather than leave the shopper looking at a frozen wheel, and
       land() then decelerates instead of easing in. On store wifi that is
       worth having; it just should not be the shape of the normal case. */
    var waitMs = num(state.wrap, "data-spin-wait", 0.4, 0) * 1000;
    state.waitTimer = setTimeout(function () {
      state.waitTimer = null;
      if (!alive(token) || !state.busy) return;
      dbg("slow response — spinning while we wait");
      startIdleSpin();
    }, waitMs);

    /* The header is what proves this spin is happening on the tablet that
       started the session. Without it the server cannot tell, and answers 403. */
    FC.api("/sessions/" + id + "/spin", { method: "POST", kiosk: true })
      .then(function (award) {
        if (!alive(token)) return;
        clearWait();
        /* data-spin-min only matters on the fallback path: once the wheel IS
           turning, cutting straight to the landing would read as a stutter.
           On the normal path the single tween is the whole animation and
           there is nothing to hold for. */
        var hold = 0;
        if (state.idleTween) {
          var minSpin = num(state.wrap, "data-spin-min", 2, 0) * 1000;
          hold = Math.max(0, minSpin - (now() - state.spinStartedAt));
        }
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
        clearWait();
        if (!alive(token)) return;
        state.busy = false;
        stopTweens(); // stop the wheel where it is — never land on an error
        handleSpinError(err);
      });
  }

  function clearWait() {
    if (state.waitTimer) clearTimeout(state.waitTimer);
    state.waitTimer = null;
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
    if (kind === "form") state.needLead = true;
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
        if (state.needLead) {
          setLeadType(state.leadType);
          leadError("");
        }
        setState(state.needLead ? "form" : "ready");
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
    // No API to wait for, so this is always the single-motion case — which
    // is exactly what you want when tuning the curve.
    setState("spinning");
    var token = state.token;
    land(index, count, function () {
      if (alive(token)) paintAward(a);
    });
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
        /* The lead form gates the wheel. It collects the phone number
           itself, so it comes BEFORE the nophone check — otherwise a session
           that never got a number would be bounced back to onboarding by a
           panel the form exists to replace. */
        state.needLead = !leadDone(id);
        if (!state.needLead && !session.phone_number) {
          // The form was already completed, so a missing number here means
          // onboarding failed silently AND the form did too. Send them back.
          setState("nophone");
          return null;
        }
        prefillLead(session);
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
        // The wheel is drawn either way; the form panel simply sits over it.
        setState(state.needLead ? "form" : "ready");
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

  /* --------------------------- the lead form ---------------------------
     A gate in front of the wheel: the shopper fills this in, and only then
     does the state go to "ready". The wheel is already drawn behind the
     panel, so submitting is a state flip, not a load.

     ONLY TWO FIELDS HAVE SOMEWHERE TO GO. phone and email have real
     endpoints; name, surname, id_type and id_number do not exist anywhere in
     the API contract, so they are buffered on Flexicare.lead and go no
     further. See the header comment — when the backend adds them, this is the
     one function to change. */

  // Per-session, so a reload does not re-ask. sessionStorage, not local:
  // the next shopper on a kiosk must never inherit this.
  function leadKey(id) {
    return "flx_spin_lead_" + id;
  }
  function leadDone(id) {
    if (!id) return false;
    try {
      return window.sessionStorage.getItem(leadKey(id)) === "1";
    } catch (e) {
      return false; // private mode: ask again rather than skipping the gate
    }
  }
  function markLeadDone(id) {
    if (!id) return;
    try {
      window.sessionStorage.setItem(leadKey(id), "1");
    } catch (e) {}
  }

  // Same normalisation flexicare-onboarding.js uses. Duplicated on purpose:
  // spin.js must not depend on a page controller that may not have loaded.
  function normaliseZaMobile(raw) {
    if (!raw) return null;
    var d = String(raw).replace(/\D/g, "");
    var national;
    if (d.length === 11 && d.slice(0, 2) === "27") national = "0" + d.slice(2);
    else if (d.length === 10 && d.charAt(0) === "0") national = d;
    else if (d.length === 9 && /^[6-8]/.test(d)) national = "0" + d;
    else return null;
    if (!/^0[6-8]\d{8}$/.test(national)) return null;
    return "+27" + national.slice(1);
  }

  function leadValue(sel) {
    var el = slot(sel);
    return el ? String(el.value == null ? "" : el.value).trim() : "";
  }

  function leadError(msg) {
    slots("[data-spin-lead-error]").forEach(function (el) {
      el.textContent = msg || "";
      el.style.display = msg ? "" : "none";
    });
  }

  function setLeadType(kind) {
    state.leadType = kind === "passport" ? "passport" : "id";
    if (state.wrap) state.wrap.setAttribute("data-spin-lead-type", state.leadType);
    /* Reflect the choice the same way the onboarding gender pills do: toggle
       a class the Designer styled, overridable per element. aria-checked
       rather than gender's aria-pressed — this is a radiogroup, not a pair of
       toggle buttons. A native <input type="radio"> is synced too, so either
       markup works. */
    slots("[data-spin-lead-idtype]").forEach(function (el) {
      var on = attr(el, "data-spin-lead-idtype", "") === state.leadType;
      var cls = attr(el, "data-selected-class", "is-selected");
      var sel = attr(el, "data-selected-target", null);
      var target = (sel && el.querySelector(sel)) || el;
      if (target.classList) target.classList.toggle(cls, on);
      el.setAttribute("aria-checked", on ? "true" : "false");
      var native =
        (el.matches && el.matches('input[type="radio"]') && el) ||
        (el.querySelector && el.querySelector('input[type="radio"]'));
      if (native) native.checked = on;
    });
    write(
      "[data-spin-lead-idlabel]",
      state.leadType === "passport" ? "Passport number" : "ID number"
    );
  }

  function refreshLeadButton() {
    slots("[data-spin-lead-submit]").forEach(function (el) {
      el.setAttribute("aria-disabled", state.leadBusy ? "true" : "false");
      if (el.tagName === "BUTTON") el.disabled = !!state.leadBusy;
    });
  }

  // Fill from what the session already knows, so the shopper is confirming
  // rather than retyping. first_name and phone_number are normally already
  // captured at /onboarding.
  function prefillLead(session) {
    if (!session) return;
    var pairs = [
      ["[data-spin-lead-name]", session.first_name],
      ["[data-spin-lead-phone]", session.phone_number],
      ["[data-spin-lead-email]", session.email],
    ];
    for (var i = 0; i < pairs.length; i++) {
      var el = slot(pairs[i][0]);
      if (el && !el.value && pairs[i][1]) el.value = pairs[i][1];
    }
    setLeadType(state.leadType);
    leadError("");
  }

  function readLead() {
    var phoneRaw = leadValue("[data-spin-lead-phone]");
    return {
      name: leadValue("[data-spin-lead-name]"),
      surname: leadValue("[data-spin-lead-surname]"),
      phoneRaw: phoneRaw,
      phone: normaliseZaMobile(phoneRaw),
      email: leadValue("[data-spin-lead-email]"),
      idType: state.leadType,
      idNumber: leadValue("[data-spin-lead-idnumber]").toUpperCase(),
    };
  }

  // Returns an error string, or null when the form is good.
  function validateLead(f) {
    if (!f.name) return "Please enter your name.";
    if (!f.surname) return "Please enter your surname.";
    if (!f.phone)
      return "Enter a valid South African mobile number, e.g. 082 123 4567.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email))
      return "Please enter a valid email address.";
    if (f.idType === "passport") {
      if (!/^[A-Z0-9]{6,20}$/.test(f.idNumber))
        return "Enter your passport number (6–20 letters or numbers).";
    } else if (!/^\d{13}$/.test(f.idNumber)) {
      return "A South African ID number is 13 digits.";
    }
    return null;
  }

  function submitLead() {
    if (state.leadBusy) return;
    var id = FC.getSessionId();
    if (!id) {
      go(attr(state.wrap, "data-spin-onboarding", "/onboarding"));
      return;
    }

    var f = readLead();
    var bad = validateLead(f);
    if (bad) {
      leadError(bad);
      return;
    }

    var token = state.token;
    state.leadBusy = true;
    refreshLeadButton();
    leadError("");

    /* Everything the backend has no home for. In memory only — a hard reload
       loses it, which is exactly why this is temporary. */
    FC.lead = {
      name: f.name,
      surname: f.surname,
      phone: f.phone,
      email: f.email,
      id_type: f.idType,
      id_number: f.idNumber,
    };

    // In the demo there is no session to PATCH — skip straight to the wheel.
    if (state.demo) {
      state.leadBusy = false;
      refreshLeadButton();
      dbg("lead (demo): not sent", FC.lead);
      setState("ready");
      return;
    }

    var base = "/sessions/" + id + "/contact/";
    FC.api(base + "phone", { method: "PATCH", body: { phone_number: f.phone } })
      .then(function () {
        if (!alive(token)) return null;
        return FC.api(base + "email", { method: "PATCH", body: { email: f.email } });
      })
      .then(function () {
        if (!alive(token)) return;
        state.leadBusy = false;
        refreshLeadButton();
        markLeadDone(id);
        if (state.session) {
          state.session.phone_number = f.phone;
          state.session.email = f.email;
        }
        FC.setFirstName(f.name);
        dbg("lead captured; name/surname/id buffered only", FC.lead);
        setState("ready");
      })
      .catch(function (err) {
        if (!alive(token)) return;
        state.leadBusy = false;
        refreshLeadButton();
        /* A 422 is the shopper's problem to fix — the server validated the
           number or the address. Anything else is ours, and must NOT trap
           them in front of a wheel they were promised. */
        if (err && err.status === 422) {
          leadError(validationDetail(err) || "Please check your details and try again.");
          return;
        }
        dbg("lead save failed", err && err.message);
        leadError("We couldn't save your details — please try again.");
      });
  }

  // FastAPI sends 422 as a list of { msg }. Surface the first one.
  function validationDetail(err) {
    var d = err && err.data && err.data.detail;
    if (typeof d === "string") return d;
    if (d && d.length && d[0] && d[0].msg) return String(d[0].msg);
    return null;
  }

  /* ------------------------ delegated listeners ------------------------ */

  function onClick(e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function" || !state.wrap) return;

    var goBtn = t.closest("[data-spin-go]");
    if (goBtn) {
      e.preventDefault();
      // Same button, two jobs — see refreshButton.
      if (state.mode === "form") submitLead();
      else onSpin();
      return;
    }

    var idType = t.closest("[data-spin-lead-idtype]");
    if (idType && state.wrap.contains(idType)) {
      setLeadType(attr(idType, "data-spin-lead-idtype", "id"));
      leadError("");
      // Not prevented: a real <input type="radio"> still needs to check itself.
    }

    var leadBtn = t.closest("[data-spin-lead-submit]");
    if (leadBtn) {
      e.preventDefault();
      submitLead();
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
    state.rotors = null;
    state.busy = false;
    state.needLead = false;
    state.leadBusy = false;
    state.leadType = "id";
    state.painted = false;
    state.navHidden = false;
    stopTweens();
    stopCooldown();
    resetPanels();

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

  /* Panels are authored Webflow nodes, so on a dev-mode reinit they are the
     SAME elements — a tween still running from the last state would keep
     writing to them. Kill them and forget what was visible. */
  function resetPanels() {
    slots("[data-spin-when]").forEach(function (el) {
      resetPanel(el);
      el.__spinOn = undefined;
    });
  }

  function teardown() {
    stopTweens();
    stopCooldown();
    resetPanels();
    state.painted = false;
    /* Deliberately NOT restoring the nav: we are on our way to the landing
       page, where it is collapsed anyway, and the next navigation's
       applyVisibility opens it if the destination wants it. Reopening here
       would flash it in for the length of the leave transition. */
    state.navHidden = false;
    state.token++; // invalidate anything still in flight
    if (state.wrap) {
      state.wrap.removeAttribute("data-spin-state");
      state.wrap.removeAttribute("data-spin-reason");
      state.wrap.removeAttribute("data-spin-demo");
    }
    state.demo = null;
    state.needLead = false;
    state.leadBusy = false;
    state.leadType = "id";
    var root = document.documentElement;
    if (root) root.removeAttribute("data-spin-state");
    state.wrap = null;
    state.segments = null;
    state.session = null;
    state.rotor = null;
    state.rotors = null;
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

  /* ------------------------- structure inspector -------------------------
     `Flexicare.spin.panels()` in the console. Answers "why is my panel not
     animating" without reading this file: it prints every [data-spin-when]
     the script can actually SEE, what it decided about each one, and the
     three things about the markup that change the answer — whether the panel
     is a glass host (fades, never scales), whether it is nested inside
     another panel (the parent carries the motion), and what CSS is really
     doing to its display. A panel that does not appear in this table is one
     the script never found: it is outside [data-spin] and outside the barba
     container, and nothing will ever show it. */
  FC.spin.panels = function () {
    if (!state.wrap) {
      console.warn("[spin] not initialised on this page — no [data-spin] wrapper.");
      return [];
    }
    var rows = slots("[data-spin-when]").map(function (el) {
      var cs = window.getComputedStyle(el);
      var parent = null;
      var p = el.parentNode;
      while (p && p.nodeType === 1 && p !== state.wrap) {
        if (p.hasAttribute("data-spin-when")) {
          parent = p.getAttribute("data-spin-when");
          break;
        }
        p = p.parentNode;
      }
      return {
        when: el.getAttribute("data-spin-when"),
        element: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().replace(/\s+/g, ".") : ""),
        visible: el.__spinOn === true,
        display: cs.display,
        opacity: cs.opacity,
        position: cs.position,
        "glass host": isGlassHost(el) ? "YES — opacity only" : "no",
        "nested in": parent || "—",
      };
    });
    if (console.table) console.table(rows);
    else console.log(rows);
    console.log(
      "[spin] state:", state.mode,
      "| painted:", state.painted,
      "| gsap:", !!window.gsap,
      "| prefers-reduced-motion:", reduced()
    );
    var cfg = panelCfg();
    console.log("[spin] panel motion:", cfg);
    return rows;
  };

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
