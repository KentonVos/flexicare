/* ============================================================
   Background Motion v3 — drift + orbit + transition reaction (GSAP)
   ------------------------------------------------------------
   Plain JS. Load AFTER gsap (and, for the reaction, ideally after
   @barba/core — order isn't critical; the reaction attaches when
   Barba becomes available).

   Everything here animates elements that live OUTSIDE the Barba
   container (background-gradients is persistent), so the loops are
   created once and keep running through every navigation. Nothing
   is torn down or re-primed on nav, so nothing snaps.

   ============================================================
   THREE LAYERS, THREE DOM LEVELS (so they can't fight over transform)
   ------------------------------------------------------------
   REACT  scale swell on a PARENT FIELD ....... data-drift-field
      └ ORBIT  closed-loop path on the WRAPPER . data-orbit
          └ DRIFT  organic wander on each BLOB .. data-drift
   CSS transforms compose down the tree, so each layer multiplies
   with the ones below instead of overwriting them. Keep each
   attribute on its own element. Do NOT stack two of these on the
   same node (the module warns if you do).

   Intended for this project:
     background-gradients   ->  data-drift-field   (breathes on nav)
     bottom-glow-wrapper    ->  data-orbit         (circles the screen)
     teal/green/blue-glow-main -> data-drift        (wander inside)
     blue-glow-still        ->  (untagged)         (anchor)

   ============================================================
   DRIFT  (data-drift) — organic wander, in place
   ------------------------------------------------------------
   Seamless: transforms only; sine.inOut yoyo tweens that turn
   around at zero velocity and return exactly to their start;
   per-element randomised amplitude/duration + random start phase
   so blobs never move in lockstep.
     data-drift-x="60"          horizontal amplitude, px
     data-drift-y="45"          vertical amplitude, px
     data-drift-scale="0.06"    scale swing (±)
     data-drift-rotate="4"      rotation amplitude, deg
     data-drift-duration="8"    base seconds (each axis varies ±30%)
     data-drift-ease="sine.inOut"

   ============================================================
   ORBIT  (data-orbit) — continuous loop around the SCREEN
   ------------------------------------------------------------
   The element's centre traces an ellipse centred on the VIEWPORT
   (not on the element's own resting position — so a wrapper that
   naturally sits off-screen is lifted onto the screen to orbit).
   Perfectly seamless: constant-speed angular driver, so 360°
   wraps to 0° identically. Recomputes on resize + load.
     data-orbit-rx="140"        horizontal radius, px
                                (default = 35% of viewport width)
     data-orbit-ry="300"        vertical radius, px
                                (default = 35% of viewport height)
     data-orbit-cx="0"          centre offset from viewport centre, px
     data-orbit-cy="0"          centre offset from viewport centre, px
     data-orbit-duration="20"   seconds for one full loop
     data-orbit-direction="cw"  "cw" | "ccw"
     data-orbit-start="0"       start angle, deg (default random)

   ============================================================
   REACTION  (data-drift-field) — transition "breath"
   ------------------------------------------------------------
   On a Barba navigation the field swells as the old page leaves and
   settles back as the new page enters. Navigation only (not first
   load). Composes with the orbit + drift running underneath.
     data-drift-react-scale="0.05"   swell amount (±)
     data-drift-react-in="0.5"       swell (leave) seconds
     data-drift-react-out="0.9"      settle (enter) seconds

   ============================================================
   Global defaults: window.BackgroundMotion.config
   API:
     BackgroundMotion.refresh(scope)   re-scan for drift/orbit els
     BackgroundMotion.stop() / start()  pause / resume all motion
     BackgroundMotion.kill(el)         stop + reset one element

   Respects prefers-reduced-motion (all motion disabled).
   ============================================================ */
(function () {
  "use strict";

  if (!window.gsap) {
    console.warn("[BackgroundMotion] GSAP not found — load it first.");
    return;
  }
  var gsap = window.gsap;
  var rnd = gsap.utils.random;

  var config = {
    // drift (inner blobs)
    x: 60,
    y: 45,
    scale: 0.06,
    rotate: 4,
    duration: 8,
    vary: 0.3,
    ease: "sine.inOut",
    // orbit (wrapper around the screen)
    orbit: {
      rxFactor: 0.35, // default radius as a fraction of viewport width
      ryFactor: 0.35, // default radius as a fraction of viewport height
      duration: 20,
      direction: "cw",
    },
    // reaction (transition breath)
    react: {
      scale: 0.05,
      in: 0.5,
      out: 0.9,
      easeIn: "power2.out",
      easeOut: "power3.out",
    },
  };
  window.BackgroundMotion = { config: config };

  var DRIFT = "[data-drift]";
  var ORBIT = "[data-orbit]";
  var FIELD = "[data-drift-field]";

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function attrNum(el, name, def) {
    var v = el.getAttribute(name);
    if (v === null || v === "") return def;
    var n = parseFloat(v);
    return isNaN(n) ? def : n;
  }
  function driftNum(el, key, def) {
    return attrNum(el, "data-drift-" + key, def);
  }
  function orbitNum(el, key, def) {
    return attrNum(el, "data-orbit-" + key, def);
  }
  function hasAttr(el, name) {
    var v = el.getAttribute(name);
    return v !== null && v !== "";
  }

  function baseHygiene(el) {
    el.style.willChange = "transform";
    if (getComputedStyle(el).pointerEvents !== "none")
      el.style.pointerEvents = "none"; // behind glass; never eat taps
  }

  /* =========================== DRIFT =========================== */

  function axis(el, vars, base, ease) {
    var dur = base * rnd(1 - config.vary, 1 + config.vary);
    vars.duration = dur;
    vars.ease = ease;
    vars.repeat = -1;
    vars.yoyo = true;
    vars.delay = -rnd(0, dur); // negative delay = start partway through
    return gsap.to(el, vars);
  }

  function drift(el) {
    if (reduceMotion || el.__driftTweens) return;
    if (el.hasAttribute("data-orbit") || el.hasAttribute("data-drift-field")) {
      console.warn(
        "[BackgroundMotion] data-drift is stacked with orbit/field on the " +
          "same element; they'll fight over transform. Split them across " +
          "parent/child elements.",
        el
      );
    }

    var ax = driftNum(el, "x", config.x);
    var ay = driftNum(el, "y", config.y);
    var as = driftNum(el, "scale", config.scale);
    var ar = driftNum(el, "rotate", config.rotate);
    var base = driftNum(el, "duration", config.duration);
    var ease = el.getAttribute("data-drift-ease") || config.ease;

    baseHygiene(el);
    gsap.set(el, { x: 0, y: 0, scale: 1, rotation: 0 });

    var tweens = [];
    if (ax) tweens.push(axis(el, { x: rnd([-ax, ax]) }, base, ease));
    if (ay) tweens.push(axis(el, { y: rnd([-ay, ay]) }, base, ease));
    if (as)
      tweens.push(axis(el, { scale: 1 + rnd([-as, as]) }, base * 1.4, ease));
    if (ar)
      tweens.push(axis(el, { rotation: rnd([-ar, ar]) }, base * 1.6, ease));

    el.__driftTweens = tweens;
  }

  /* =========================== ORBIT =========================== */

  var orbitEls = [];

  // Recover the element's *untransformed* centre (viewport coords) by reading
  // its current rect and subtracting the translate we last applied.
  function remeasure(el) {
    var s = el.__orbit;
    if (!s) return;
    var r = el.getBoundingClientRect();
    s.restCX = r.left + r.width / 2 - s.curX;
    s.restCY = r.top + r.height / 2 - s.curY;
    if (!hasAttr(el, "data-orbit-rx"))
      s.rx = window.innerWidth * config.orbit.rxFactor;
    if (!hasAttr(el, "data-orbit-ry"))
      s.ry = window.innerHeight * config.orbit.ryFactor;
  }

  function orbit(el) {
    if (reduceMotion || el.__orbit) return;
    if (el.hasAttribute("data-drift")) {
      console.warn(
        "[BackgroundMotion] data-orbit and data-drift on the same element " +
          "fight over transform. Orbit the parent, drift the children.",
        el
      );
    }

    baseHygiene(el);

    var s = {
      angle: 0,
      dir:
        (el.getAttribute("data-orbit-direction") || config.orbit.direction)
          .toLowerCase()
          .indexOf("ccw") === 0
          ? -1
          : 1,
      phase: (orbitNum(el, "start", rnd(0, 360)) * Math.PI) / 180,
      cx: orbitNum(el, "cx", 0),
      cy: orbitNum(el, "cy", 0),
      rx: orbitNum(el, "rx", window.innerWidth * config.orbit.rxFactor),
      ry: orbitNum(el, "ry", window.innerHeight * config.orbit.ryFactor),
      curX: 0,
      curY: 0,
    };
    el.__orbit = s;

    // measure rest centre with no translate applied yet
    gsap.set(el, { x: 0, y: 0 });
    var r = el.getBoundingClientRect();
    s.restCX = r.left + r.width / 2;
    s.restCY = r.top + r.height / 2;

    function render() {
      var a = s.phase + s.dir * s.angle;
      var targetCX = window.innerWidth / 2 + s.cx + Math.cos(a) * s.rx;
      var targetCY = window.innerHeight / 2 + s.cy + Math.sin(a) * s.ry;
      s.curX = targetCX - s.restCX;
      s.curY = targetCY - s.restCY;
      gsap.set(el, { x: s.curX, y: s.curY });
    }
    render();

    s.tween = gsap.to(s, {
      angle: Math.PI * 2,
      duration: orbitNum(el, "duration", config.orbit.duration),
      ease: "none",
      repeat: -1,
      onUpdate: render,
    });

    orbitEls.push(el);
  }

  // Re-derive rest centre + default radii after layout can shift.
  var resizeT;
  function onResize() {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      orbitEls.forEach(remeasure);
    }, 150);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("load", function () {
    orbitEls.forEach(remeasure);
  });

  /* ========================= REACTION ========================= */

  function fields() {
    return Array.prototype.slice.call(document.querySelectorAll(FIELD));
  }
  function swell() {
    if (reduceMotion) return;
    fields().forEach(function (el) {
      el.style.willChange = "transform";
      gsap.to(el, {
        scale: 1 + attrNum(el, "data-drift-react-scale", config.react.scale),
        duration: attrNum(el, "data-drift-react-in", config.react.in),
        ease: config.react.easeIn,
        overwrite: "auto",
      });
    });
  }
  function settle() {
    if (reduceMotion) return;
    fields().forEach(function (el) {
      gsap.to(el, {
        scale: 1,
        duration: attrNum(el, "data-drift-react-out", config.react.out),
        ease: config.react.easeOut,
        overwrite: "auto",
        onComplete: function () {
          el.style.willChange = "";
        },
      });
    });
  }
  function wireReaction() {
    if (!window.barba || !window.barba.hooks || wireReaction.__done) return;
    wireReaction.__done = true;
    gsap.set(fields(), { scale: 1 });
    window.barba.hooks.leave(swell);
    window.barba.hooks.enter(settle);
  }

  /* ===================== scan / boot / API ===================== */

  function scan(scope) {
    var root = scope || document;
    root.querySelectorAll(DRIFT).forEach(drift);
    root.querySelectorAll(ORBIT).forEach(orbit);
    wireReaction();
  }

  function boot() {
    scan(document);
    if (!wireReaction.__done) setTimeout(wireReaction, 0);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  function eachTween(fn) {
    document.querySelectorAll(DRIFT).forEach(function (el) {
      if (el.__driftTweens) el.__driftTweens.forEach(fn);
    });
    orbitEls.forEach(function (el) {
      if (el.__orbit && el.__orbit.tween) fn(el.__orbit.tween);
    });
  }

  window.BackgroundMotion.refresh = function (scope) {
    scan(scope);
  };
  window.BackgroundMotion.stop = function () {
    eachTween(function (t) {
      t.pause();
    });
  };
  window.BackgroundMotion.start = function () {
    eachTween(function (t) {
      t.resume();
    });
  };
  window.BackgroundMotion.kill = function (el) {
    if (el.__driftTweens) {
      el.__driftTweens.forEach(function (t) {
        t.kill();
      });
      el.__driftTweens = null;
    }
    if (el.__orbit) {
      if (el.__orbit.tween) el.__orbit.tween.kill();
      el.__orbit = null;
      orbitEls = orbitEls.filter(function (n) {
        return n !== el;
      });
    }
    gsap.set(el, { clearProps: "transform,willChange" });
  };
})();
