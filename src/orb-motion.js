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

   Intended for this project. Note the squish sits on the WRAPPER,
   the ancestor shared by the glass and the glows: one affine warp
   there deforms all of them as a single unit, so they cannot drift
   out of agreement with each other, and the wrapper's static
   circular overflow:hidden is what keeps the glows contained.
     orb-container  ->  data-orb-path      (drifts + rotates)
     orb-wrapper    ->  data-orb-squish    (warps the whole bubble;
                        border-radius 50% + overflow hidden, static)
     glass-orb      ->  (glass only -- inherits the wrapper's warp)
     green-orb-glow ->  data-orb-float + data-orb-float-follow
     blue-orb-glow  ->  data-orb-float + data-orb-float-follow

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
      data-orb-squish-uniform="0"  1 = scale both axes together (a breathe,
                                   not a squash)
      data-orb-squish-skew="0"     shear swing, +/- degrees on both axes.
                                   Leans and rolls the shape, so it reads as
                                   a warping blob rather than an ellipse that
                                   grows and shrinks. Safe on glass
      data-orb-squish-duration="5" base seconds per morph step
      data-orb-squish-ease="sine.inOut"

   WHERE TO PUT IT: on orb-wrapper -- the ancestor shared by the
   glass and the glows -- with a static border-radius 50% and
   overflow: hidden. Everything below it then warps as one unit and
   nothing can escape the boundary. Putting it on glass-orb instead
   leaves the glows as siblings that warp independently of the glass
   and spill outside it.
   Radius morphing only shows where something is painted or clipped:
   an element with no background and no overflow:hidden will squash
   (scale) but show no morph.

   ============================================================
   GLASS -- do NOT morph a data-liquid-glass element
   ------------------------------------------------------------
   glass.js bakes its refraction into a displacement map built from
   (a) offsetWidth/offsetHeight -- the LAYOUT box, which transforms
   do not change -- and (b) ONE corner radius, borderTopLeftRadius,
   fed to makeSDF as a uniform rounded rect. So on a glass node:
     - 7 of the 8 border-radius values are invisible to it. Its rim
       stays a circle while the painted edge becomes a blob, and the
       two visibly separate.
     - scaleX/scaleY squash the finished backdrop-filter output, so
       the glow seen THROUGH the glass stretches out of register
       with the real background behind it. ResizeObserver never
       fires either (a transform is not a resize), so nothing
       rebuilds.
   Rebuilding per frame is not an option: buildMap is a per-pixel JS
   loop plus a toDataURL, which is why glass.js has freeze()/
   unfreeze() at all.

   AFFINE vs NON-AFFINE is the real line, though. border-radius is
   non-affine: it changes the SILHOUETTE while the baked map still
   describes a circle, so rim and edge separate. scale and skew are
   affine -- they transform the element's finished rendering, rim and
   map together, so those two cannot fall out of register with each
   other. (The background refracted THROUGH the glass does get
   stretched, which is a physical inaccuracy rather than a visible
   seam, and for a squashed bubble it arguably looks right.)

   So on a glass node: no radius morph, but scale + skew are fair
   game, and skew is what makes an affine deform read as a warping
   blob instead of an ellipse that merely grows:
     data-orb-squish-radius="0" data-orb-squish-scale="0.05"
                               data-orb-squish-skew="5"
   Put any true silhouette morph on the soft gradient layers, which
   have no rim to fall out of register (data-orb-float-radius).

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
     data-orb-float-radius="0"    border-radius blob morph, same as
                                  data-orb-squish-radius. Safe to combine
                                  with float because the morph writes
                                  border-radius, not transform. This is
                                  where the squishy look belongs once the
                                  glass node is off limits.
     data-orb-float-follow="0"    seconds of LAG behind the warping
                                  ancestor (0 = off). See FOLLOW below.

   ============================================================
   FOLLOW  (data-orb-float-follow) -- liquid inside the membrane
   ------------------------------------------------------------
   A child already INHERITS its ancestor's transform, so with the
   squish on a shared ancestor the inner layers deform along with the
   bubble -- but rigidly, like a decal printed on it. Real liquid
   lags the container that squeezes it.

   The trick: the child renders the deform the host had a moment ago,
   by writing the RATIO of a smoothed copy of the host's deform to
   its live one --
       inherited * (lagged / live) == lagged
   -- so the inheritance is cancelled out and replaced by the lagged
   value. Skews subtract instead of dividing, because they compose
   additively. Smoothing is exponential and dt-based, so it feels the
   same at 60Hz and 120Hz.

   It also squeezes the wander along whichever axis the host is
   narrowing, so a layer stays proportionally placed inside instead
   of being pushed out and clipped away.

   Needs an ancestor carrying data-orb-squish (it warns if there
   isn't one). Runs on gsap.ticker, removed by kill().

   REQUIRES, in Webflow, on the ancestor that squishes:
     - a STATIC border-radius (50% for a circle) and overflow: hidden,
       which is what actually guarantees nothing escapes. Keep that
       radius static: morphing it would clip the glass rim
       non-affinely and reintroduce the desync described above.
   Values: 0.25-0.5 reads as water, 0.8+ as something viscous.

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
      uniform: 0,
      skew: 0,
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
      radius: 0,
      follow: 0,
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
  // `hug`, when given, is a live {x, y} multiplier read every frame -- used by
  // FOLLOW to shrink the wander along whichever axis the parent is squeezing,
  // so a layer stays proportionally placed inside instead of being clipped away.
  function wander(el, ax, ay, duration, store, hug) {
    var p1 = rnd(0, Math.PI * 2),
      p2 = rnd(0, Math.PI * 2),
      p3 = rnd(0, Math.PI * 2),
      p4 = rnd(0, Math.PI * 2);
    var s = { a: 0 };

    function render() {
      var a = s.a;
      var hx = hug ? hug.x : 1;
      var hy = hug ? hug.y : 1;
      gsap.set(el, {
        x: ax * hx * (0.7 * Math.sin(a + p1) + 0.3 * Math.sin(3 * a + p2)),
        y: ay * hy * (0.7 * Math.sin(2 * a + p3) + 0.3 * Math.sin(a + p4)),
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

  // Endless chain of random-target morphs. A fresh target each step, so there
  // is no recognisable loop. Shared by SQUISH and FLOAT -- it writes
  // border-radius, never transform, so it composes with either.
  // Each endless chain has exactly one live tween at a time. Hold it by name so
  // a later chain can't evict an earlier one's handle and leave stop()/start()
  // with nothing to pause.
  function hold(state, key, tween) {
    state.slots[key] = tween;
    return tween;
  }
  function eachSlot(state, fn) {
    Object.keys(state.slots).forEach(function (k) {
      fn(state.slots[k]);
    });
  }

  function morphRadius(el, amp, base, ease, state) {
    var vary = config.squish.vary;
    var r = radiusTarget(amp);
    writeRadius(el, r);
    (function step() {
      if (!state.alive) return;
      var to = radiusTarget(amp);
      to.duration = base * rnd(1 - vary, 1 + vary);
      to.ease = ease;
      to.onUpdate = function () {
        writeRadius(el, r);
      };
      to.onComplete = step;
      hold(state, "radius", gsap.to(r, to));
    })();
  }

  // glass.js bakes its refraction from offsetWidth/offsetHeight and ONE corner
  // radius, so a morphing or non-uniformly scaled glass node desyncs its rim
  // from its painted edge. Full explanation in the header.
  function warnIfGlass(el, amp) {
    if (!amp || !el.hasAttribute("data-liquid-glass")) return;
    console.warn(
      "[OrbMotion] border-radius morphing on a data-liquid-glass element will " +
        "pull its refraction rim out of register with its painted edge -- " +
        "glass bakes a displacement map from the layout box and one corner " +
        "radius, so the map stays a circle. Set data-orb-squish-radius=\"0\" " +
        "here and get the warp from data-orb-squish-scale + " +
        "data-orb-squish-skew (affine, so rim and map deform together); put " +
        "any true silhouette morph on the soft glow layers instead.",
      el
    );
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
    var uniform = num(el, "data-orb-squish-uniform", config.squish.uniform);
    var sk = num(el, "data-orb-squish-skew", config.squish.skew);
    var base = num(el, "data-orb-squish-duration", config.squish.duration);
    var ease = el.getAttribute("data-orb-squish-ease") || config.squish.ease;
    var vary = config.squish.vary;
    var state = { slots: {}, alive: true };
    el.__orbSquish = state;
    tracked.push(el);

    warnIfGlass(el, amp);
    willChange(el, amp ? "transform, border-radius" : "transform");

    // 1. the blob silhouette.
    if (amp) morphRadius(el, amp, base, ease, state);

    // 2. scale. Counter-phase by default -- x up while y goes down ~80% as
    //    much, roughly volume-preserving, which is what reads as "squishy"
    //    rather than "pulsing bigger and smaller". Uniform mode keeps both
    //    axes together: less alive, but the only kind a glass rim survives.
    if (sc) {
      gsap.set(el, { scaleX: 1, scaleY: 1 });
      (function stepScale() {
        if (!state.alive) return;
        var k = rnd(-sc, sc);
        var vars = {
          duration: base * 1.3 * rnd(1 - vary, 1 + vary),
          ease: ease,
          onComplete: stepScale,
        };
        if (uniform) {
          vars.scale = 1 + k;
        } else {
          vars.scaleX = 1 + k;
          vars.scaleY = 1 - k * 0.8;
        }
        hold(state, "scale", gsap.to(el, vars));
      })();
    }

    // 3. shear, on its own slower clock so it never lines up with the scale.
    //    An affine deform of a circle is an ellipse; skewing it too makes that
    //    ellipse lean and roll, which is what reads as a warping blob. Safe on
    //    glass -- it deforms the rim and the displacement map as one unit.
    if (sk) {
      gsap.set(el, { skewX: 0, skewY: 0 });
      (function stepSkew() {
        if (!state.alive) return;
        hold(
          state,
          "skew",
          gsap.to(el, {
            skewX: rnd(-sk, sk),
            skewY: rnd(-sk, sk),
            duration: base * 1.9 * rnd(1 - vary, 1 + vary),
            ease: ease,
            onComplete: stepSkew,
          })
        );
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

    // FOLLOW: lag the warping ancestor, so the layer reads as liquid inside a
    // membrane rather than a decal glued to it.
    var lag = num(el, "data-orb-float-follow", config.float.follow);
    var host = lag ? findHost(el) : null;
    if (lag && !host) {
      console.warn(
        "[OrbMotion] data-orb-float-follow needs an ancestor carrying " +
          "data-orb-squish to follow; none found. Ignoring.",
        el
      );
      lag = 0;
    }
    var hug = lag ? { x: 1, y: 1 } : null;

    wander(
      el,
      num(el, "data-orb-float-x", config.float.x),
      num(el, "data-orb-float-y", config.float.y),
      base,
      tweens,
      hug
    );
    spin(el, num(el, "data-orb-float-spin", config.float.spin), 1, tweens);

    // Breathe on its own clock so it never syncs with the wander. Under FOLLOW
    // it has to run through a proxy: the follow writer owns scaleX/scaleY, and
    // a tween on `scale` would fight it for the same two properties.
    var sc = num(el, "data-orb-float-scale", config.float.scale);
    var breathe = { v: 1 };
    if (sc) {
      var dur = base * 0.55;
      tweens.push(
        gsap.to(lag ? breathe : el, {
          duration: dur,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: -rnd(0, dur), // negative delay = start partway through
          v: lag ? 1 + rnd(-sc, sc) : undefined,
          scale: lag ? undefined : 1 + rnd(-sc, sc),
        })
      );
    }

    if (lag) followHost(el, host, lag, hug, breathe);

    // Soft gradient layers have no refraction rim to fall out of register, so
    // this is where the blob morph belongs. It writes border-radius, not
    // transform, so it composes with the wander above.
    var amp = num(el, "data-orb-float-radius", config.float.radius);
    if (amp) {
      var state = { slots: {}, alive: true };
      el.__orbSquish = state; // reuse the squish slot so kill() clears the radius
      willChange(el, "transform, border-radius");
      morphRadius(el, amp, base * 0.4, config.squish.ease, state);
    }

    el.__orbTweens = tweens;
    tracked.push(el);
  }

  /* ============================== FOLLOW ============================== */

  function findHost(el) {
    var n = el.parentNode;
    while (n && n.nodeType === 1) {
      if (n.hasAttribute("data-orb-squish")) return n;
      n = n.parentNode;
    }
    return null;
  }

  // The child already INHERITS the host's transform, so to make it lag we write
  // the ratio between a smoothed copy of the host's deform and its live one:
  //   inherited * (lagged / live) == lagged
  // i.e. the child ends up rendering the deform the host had a moment ago.
  // Skews subtract rather than divide because they compose additively.
  function followHost(el, host, tau, hug, breathe) {
    var L = null;
    function tick(time, dt) {
      var sx = gsap.getProperty(host, "scaleX") || 1;
      var sy = gsap.getProperty(host, "scaleY") || 1;
      var kx = gsap.getProperty(host, "skewX") || 0;
      var ky = gsap.getProperty(host, "skewY") || 0;
      if (!L) L = { sx: sx, sy: sy, kx: kx, ky: ky };

      // Frame-rate independent exponential smoothing: same feel at 60 or 120Hz.
      var a = 1 - Math.exp(-(dt / 1000) / tau);
      L.sx += (sx - L.sx) * a;
      L.sy += (sy - L.sy) * a;
      L.kx += (kx - L.kx) * a;
      L.ky += (ky - L.ky) * a;

      // Squeeze the wander along whichever axis the host is narrowing.
      hug.x = sx;
      hug.y = sy;

      gsap.set(el, {
        scaleX: (L.sx / sx) * breathe.v,
        scaleY: (L.sy / sy) * breathe.v,
        skewX: L.kx - kx,
        skewY: L.ky - ky,
      });
    }
    gsap.ticker.add(tick);
    el.__orbTick = tick;
  }

  /* ======================= scan / prune / boot ======================= */

  function killEl(el) {
    if (el.__orbTick) {
      gsap.ticker.remove(el.__orbTick);
      el.__orbTick = null;
    }
    if (el.__orbTweens) {
      el.__orbTweens.forEach(function (t) {
        t.kill();
      });
      el.__orbTweens = null;
    }
    if (el.__orbSquish) {
      el.__orbSquish.alive = false;
      eachSlot(el.__orbSquish, function (t) {
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
      if (el.__orbSquish) eachSlot(el.__orbSquish, fn);
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
