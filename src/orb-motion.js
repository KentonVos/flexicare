/* ============================================================
   Orb Motion v1 — fluid orb: path + squish + float (GSAP)
   ------------------------------------------------------------
   Plain JS. Load AFTER gsap. Load AFTER transition.js if you want
   it to re-scan on Barba navigations (it attaches to Barba's hooks
   when Barba is available — order isn't critical, but the scripts
   below assume the documented footer order).

   Unlike background-motion.js (which animates the PERSISTENT
   background outside the Barba container and therefore only ever
   scans once), everything here is expected to live INSIDE
   data-barba="container". So this module re-scans after every
   navigation and prunes tweens whose element left the DOM.

   ============================================================
   THREE LAYERS, THREE DOM LEVELS (so they can't fight over transform)
   ------------------------------------------------------------
   PATH    translate + spin on the OUTER shell ..... data-orb-path
      \_ SQUISH  border-radius morph + scale ....... data-orb-squish
          \_ FLOAT   wander inside the parent ...... data-orb-float
   CSS transforms compose down the tree, so each layer multiplies
   with the ones below instead of overwriting it. Keep each
   attribute on its own element -- the module warns if you stack
   PATH and FLOAT (both write x/y/rotation) on one node.

   Intended for this project:
     orb-container  ->  data-orb-path      (drifts + rotates)
     orb-wrapper    ->  data-orb-squish    (squishy bubble)
     glass-orb      ->  data-orb-float     (or squish, see below)
     green-orb-glow ->  data-orb-float     (wanders inside)
     blue-orb-glow  ->  data-orb-float     (wanders inside)

   ============================================================
   PATH  (data-orb-path) -- slow fluid wander + rotation
   ------------------------------------------------------------
   The element's centre traces a closed organic loop: two summed
   sine harmonics per axis, driven by one constant-speed angular
   driver. Integer harmonics means the loop is *exactly* periodic,
   so it never snaps at the wrap. Rotation is a separate constant
   spin (no yoyo, so no visible turnaround).
     data-orb-path-x="40"        horizontal amplitude, px
     data-orb-path-y="30"        vertical amplitude, px
     data-orb-path-duration="26" seconds for one full loop
     data-orb-path-spin="90"     seconds per 360deg turn (0 = no spin)
     data-orb-path-direction="cw"  "cw" | "ccw"  (spin direction)

   ============================================================
   SQUISH  (data-orb-squish) -- the "squishy bubble"
   ------------------------------------------------------------
   Two effects on one element, both endless chains of random
   sine.inOut tweens (a new random target each time, so it never
   loops recognisably):

   1. border-radius morph. Writes the 8-value form
      "a% b% c% d% / e% f% g% h%" with opposite corners summing to
      100, which is what makes an offset blob still read as one
      coherent bubble instead of a lumpy rectangle.
   2. counter-phase scale -- scaleX up while scaleY goes down by
      ~80% of that, i.e. roughly volume-preserving, which is what
      the eye reads as surface tension rather than "growing".

      data-orb-squish-radius="18"  radius swing, +/- percentage points
                                   around 50 (0 disables the morph)
      data-orb-squish-scale="0.05" scale swing (+/-). 0 disables it
      data-orb-squish-duration="5" base seconds per morph step
      data-orb-squish-ease="sine.inOut"

   WHERE TO PUT IT -- pick one of these two:
     a) On orb-wrapper, plus `overflow: hidden` on it in Webflow.
        The morphing radius then clips glass-orb and both glows, so
        the whole bubble silhouette squishes. Most convincing.
     b) On glass-orb (the element that actually paints the circle),
        and put data-orb-squish-scale on orb-wrapper for the squash.
        Use this if you can't set overflow: hidden.
   Radius morphing only shows where something is painted or clipped:
   an element with no background and no overflow:hidden will squash
   (scale) but show no morph.

   ============================================================
   FLOAT  (data-orb-float) -- wander inside the parent
   ------------------------------------------------------------
   Same harmonic loop as PATH but tuned for the inner glows, with a
   randomised phase and duration per element so siblings never move
   in lockstep, plus an optional slow breathe.
     data-orb-float-x="26"        horizontal amplitude, px
     data-orb-float-y="22"        vertical amplitude, px
     data-orb-float-scale="0.08"  breathe swing (+/-), 0 = off
     data-orb-float-duration="14" base seconds (varies +/-30%)
     data-orb-float-spin="0"      seconds per 360deg turn (0 = off)

   ============================================================
   Global defaults: window.OrbMotion.config
   API:
     OrbMotion.refresh(scope)   re-scan (called on Barba enter)
     OrbMotion.stop() / start() pause / resume all orb motion
     OrbMotion.kill(el)         stop + reset one element

   Respects prefers-reduced-motion (all motion disabled).

   GOTCHAS
   - Glass owns transform on any node with data-lg-press/data-lg-tilt.
     Never put data-orb-path / data-orb-float on such a node.
   - transition.js's data-anim also writes transform. On an orb
     element use data-anim-fade (opacity only) instead.
   ============================================================ */
(function () {
  "use strict";

  if (!window.gsap) {
    console.warn("[OrbMotion] GSAP not found -- load it first.");
    return;
  }
  var gsap = window.gsap;
  var rnd = gsap.utils.random;

  var config = {
    path: {
      x: 40,
      y: 30,
      duration: 26,
      spin: 90,
      direction: "cw",
    },
    squish: {
      radius: 18,
      scale: 0.05,
      duration: 5,
      ease: "sine.inOut",
      vary: 0.35,
    },
    float: {
      x: 26,
      y: 22,
      scale: 0.08,
      duration: 14,
      spin: 0,
      vary: 0.3,
    },
  };
  window.OrbMotion = { config: config };

  var PATH = "[data-orb-path]";
  var SQUISH = "[data-orb-squish]";
  var FLOAT = "[data-orb-float]";
  var ALL = PATH + "," + SQUISH + "," + FLOAT;

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Every element this module has touched, so we can prune the ones
  // Barba removed from the DOM.
  var tracked = [];

  function num(el, name, def) {
    var v = el.getAttribute(name);
    if (v === null || v === "") return def;
    var n = parseFloat(v);
    return isNaN(n) ? def : n;
  }

  function willChange(el, props) {
    el.style.willChange = props;
  }

  /* ============ shared: closed organic loop (2 harmonics/axis) ============ */

  // One constant-speed driver, integer harmonics => exactly periodic,
  // so the loop wraps with no jump and no turnaround.
  function wander(el, ax, ay, duration, store) {
    var p1 = rnd(0, Math.PI * 2),
      p2 = rnd(0, Math.PI * 2),
      p3 = rnd(0, Math.PI * 2),
      p4 = rnd(0, Math.PI * 2);
    var s = { a: 0 };

    function render() {
      var a = s.a;
      gsap.set(el, {
        x: ax * (0.7 * Math.sin(a + p1) + 0.3 * Math.sin(3 * a + p2)),
        y: ay * (0.7 * Math.sin(2 * a + p3) + 0.3 * Math.sin(a + p4)),
      });
    }
    render();

    store.push(
      gsap.to(s, {
        a: Math.PI * 2,
        duration: duration,
        ease: "none",
        repeat: -1,
        onUpdate: render,
      })
    );
  }

  function spin(el, seconds, dir, store) {
    if (!seconds) return;
    store.push(
      gsap.to(el, {
        rotation: dir * 360,
        duration: seconds,
        ease: "none",
        repeat: -1,
      })
    );
  }

  /* ============================== PATH ============================== */

  function path(el) {
    if (reduceMotion || el.__orbTweens) return;
    if (el.hasAttribute("data-orb-float")) {
      console.warn(
        "[OrbMotion] data-orb-path and data-orb-float on the same element " +
          "fight over x/y/rotation. Put path on the parent, float on the " +
          "children.",
        el
      );
    }

    var tweens = [];
    willChange(el, "transform");
    gsap.set(el, { x: 0, y: 0, rotation: 0 });

    wander(
      el,
      num(el, "data-orb-path-x", config.path.x),
      num(el, "data-orb-path-y", config.path.y),
      num(el, "data-orb-path-duration", config.path.duration),
      tweens
    );
    spin(
      el,
      num(el, "data-orb-path-spin", config.path.spin),
      (el.getAttribute("data-orb-path-direction") || config.path.direction)
        .toLowerCase()
        .indexOf("ccw") === 0
        ? -1
        : 1,
      tweens
    );

    el.__orbTweens = tweens;
    tracked.push(el);
  }

  /* ============================= SQUISH ============================= */

  // 8-value border-radius, opposite corners summing to 100 so the blob
  // stays coherent: "a% b% (100-a)% (100-b)% / e% f% (100-e)% (100-f)%".
  function radiusPair(amp) {
    return 50 + rnd(-amp, amp);
  }
  function radiusTarget(amp) {
    return {
      a: radiusPair(amp),
      b: radiusPair(amp),
      e: radiusPair(amp),
      f: radiusPair(amp),
    };
  }
  function writeRadius(el, r) {
    el.style.borderRadius =
      r.a +
      "% " +
      r.b +
      "% " +
      (100 - r.a) +
      "% " +
      (100 - r.b) +
      "% / " +
      r.e +
      "% " +
      r.f +
      "% " +
      (100 - r.e) +
      "% " +
      (100 - r.f) +
      "%";
  }

  function squish(el) {
    if (reduceMotion || el.__orbSquish) return;
    if (el.hasAttribute("data-orb-float")) {
      console.warn(
        "[OrbMotion] data-orb-squish and data-orb-float on the same element " +
          "both write scale. Squish the wrapper, float the children.",
        el
      );
    }

    var amp = num(el, "data-orb-squish-radius", config.squish.radius);
    var sc = num(el, "data-orb-squish-scale", config.squish.scale);
    var base = num(el, "data-orb-squish-duration", config.squish.duration);
    var ease = el.getAttribute("data-orb-squish-ease") || config.squish.ease;
    var vary = config.squish.vary;
    var state = { tweens: [], alive: true };
    el.__orbSquish = state;
    tracked.push(el);

    willChange(el, amp ? "transform, border-radius" : "transform");

    // 1. endless border-radius morph -- a fresh random target each step,
    //    so there's no recognisable loop.
    if (amp) {
      var r = radiusTarget(amp);
      writeRadius(el, r);
      (function stepRadius() {
        if (!state.alive) return;
        var to = radiusTarget(amp);
        to.duration = base * rnd(1 - vary, 1 + vary);
        to.ease = ease;
        to.onUpdate = function () {
          writeRadius(el, r);
        };
        to.onComplete = stepRadius;
        var t = gsap.to(r, to);
        state.tweens.push(t);
        // keep the list from growing without bound over a long session
        if (state.tweens.length > 8) state.tweens.shift();
      })();
    }

    // 2. counter-phase scale -- x up while y goes down ~80% as much.
    //    Roughly volume-preserving, which is what reads as "squishy"
    //    rather than "pulsing bigger and smaller".
    if (sc) {
      gsap.set(el, { scaleX: 1, scaleY: 1 });
      (function stepScale() {
        if (!state.alive) return;
        var k = rnd(-sc, sc);
        var t = gsap.to(el, {
          scaleX: 1 + k,
          scaleY: 1 - k * 0.8,
          duration: base * 1.3 * rnd(1 - vary, 1 + vary),
          ease: ease,
          onComplete: stepScale,
        });
        state.tweens.push(t);
        if (state.tweens.length > 8) state.tweens.shift();
      })();
    }
  }

  /* ============================== FLOAT ============================== */

  function float(el) {
    if (reduceMotion || el.__orbTweens) return;

    var tweens = [];
    var base =
      num(el, "data-orb-float-duration", config.float.duration) *
      rnd(1 - config.float.vary, 1 + config.float.vary);

    willChange(el, "transform");
    gsap.set(el, { x: 0, y: 0 });

    wander(
      el,
      num(el, "data-orb-float-x", config.float.x),
      num(el, "data-orb-float-y", config.float.y),
      base,
      tweens
    );
    spin(el, num(el, "data-orb-float-spin", config.float.spin), 1, tweens);

    // Breathe on its own clock so it never syncs with the wander.
    var sc = num(el, "data-orb-float-scale", config.float.scale);
    if (sc) {
      var dur = base * 0.55;
      tweens.push(
        gsap.to(el, {
          scale: 1 + rnd(-sc, sc),
          duration: dur,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: -rnd(0, dur), // negative delay = start partway through
        })
      );
    }

    el.__orbTweens = tweens;
    tracked.push(el);
  }

  /* ======================= scan / prune / boot ======================= */

  function killEl(el) {
    if (el.__orbTweens) {
      el.__orbTweens.forEach(function (t) {
        t.kill();
      });
      el.__orbTweens = null;
    }
    if (el.__orbSquish) {
      el.__orbSquish.alive = false;
      el.__orbSquish.tweens.forEach(function (t) {
        t.kill();
      });
      el.__orbSquish = null;
      el.style.borderRadius = "";
    }
    gsap.set(el, { clearProps: "transform,willChange" });
  }

  // Barba swaps the container, so yesterday's orb is a detached node with
  // live tweens still ticking. Drop them.
  function prune() {
    tracked = tracked.filter(function (el) {
      if (document.contains(el)) return true;
      killEl(el);
      return false;
    });
  }

  function scan(scope) {
    var root = scope || document;
    prune();
    root.querySelectorAll(PATH).forEach(path);
    root.querySelectorAll(SQUISH).forEach(squish);
    root.querySelectorAll(FLOAT).forEach(float);
  }

  function wireBarba() {
    if (!window.barba || !window.barba.hooks || wireBarba.__done) return;
    wireBarba.__done = true;
    window.barba.hooks.afterEnter(function (data) {
      scan((data && data.next && data.next.container) || document);
    });
    // The old container is only detached by the time `after` runs, so prune
    // again here — afterEnter can still see it in the DOM.
    window.barba.hooks.after(prune);
  }

  function boot() {
    scan(document);
    wireBarba();
    if (!wireBarba.__done) setTimeout(wireBarba, 0);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* ================================ API ================================ */

  function eachTween(fn) {
    tracked.forEach(function (el) {
      if (el.__orbTweens) el.__orbTweens.forEach(fn);
      if (el.__orbSquish) el.__orbSquish.tweens.forEach(fn);
    });
  }

  window.OrbMotion.refresh = function (scope) {
    scan(scope);
  };
  window.OrbMotion.stop = function () {
    eachTween(function (t) {
      t.pause();
    });
  };
  window.OrbMotion.start = function () {
    eachTween(function (t) {
      t.resume();
    });
  };
  window.OrbMotion.kill = function (el) {
    killEl(el);
    tracked = tracked.filter(function (n) {
      return n !== el;
    });
  };
  window.OrbMotion.selector = ALL;
})();
