/* ============================================================
   Liquid Glass v9 — attribute-driven, for Webflow
   ------------------------------------------------------------
   Plain JS file: host it and source with
   <script src="https://.../liquid-glass-v9.js" defer></script>

   HOOK (required):  data-liquid-glass = true
   PRESET (optional):  data-lg-preset = "cta" | "nav" | "panel" | "pill"
                       (defaults < preset < explicit data-lg-* attrs)

   REFRACTION knobs (optional):
     data-lg-strength    edge bend amount         (default 42)
     data-lg-bevel       width of the rim band     (default 34)
     data-lg-magnify     whole-face zoom           (default 8)
     data-lg-blur        backdrop blur, px         (default 8)
   LIGHTING knobs:
     data-lg-lightangle  specular direction, deg   (default 315)
                         NOTE: a global 8s sweep is ADDED to this, so the
                         angle is an offset, not a fixed direction.
     data-lg-lightspin   "0" opts this element out of the sweep
     data-lg-specular    highlight brightness      (default 0.75)
     data-lg-specsize    highlight softness, px    (default 1)
     data-lg-rim         edge-light brightness     (default 0.13)
     data-lg-rimwidth    edge thickness, px        (default 1)
   SURFACE knobs (new):
     data-lg-frost       milky overlay 0-1         (default 0)
     data-lg-glow        inner caustic band 0-1    (default 0)
   INTERACTION knobs:
     data-lg-press       press-spring depth 0-2    (default 0 = off)

   POSITIONING: glass needs a non-static host so its overlay is contained.
         If your element is already absolute / fixed / sticky it is LEFT
         ALONE; only a static one is made relative (marked data-lg-static).

   API: LiquidGlass.scan(), LiquidGlass.refresh(el),
        LiquidGlass.lightSpin(seconds)  0 = stop the light sweep
   NOTE: refraction is Chrome/Edge only; lighting, surface
         and press work in every browser.
   NOTE: glass casts NO drop shadow. Every box-shadow layer it
         writes is `inset` (rim + specular). If a glass element
         needs to sit off the page, that is a Webflow shadow on
         a WRAPPER, not a glass knob.
   CAVEAT: the press effect animates the element's transform.
         If you also animate transform with Webflow
         interactions on the same element, set
         data-lg-press="0" there to avoid a tug of war.
   ============================================================ */
(function () {
  "use strict";

  var SELECTOR = "[data-liquid-glass]";
  var DEFAULTS = {
    strength: 42,
    bevel: 34,
    magnify: 8,
    blur: 8,
    lightangle: 315,
    specular: 0.75,
    specsize: 1,
    rim: 0.13,
    rimwidth: 1,
    frost: 0,
    glow: 0,
    press: 0,
  };
  var REFRACT_KEYS = ["strength", "bevel", "magnify"];
  var NS = "http://www.w3.org/2000/svg";

  var ua = navigator.userAgent;
  var isFirefox = /firefox/i.test(ua);
  var isSafari = /^((?!chrome|chromium|crios|edg|android).)*safari/i.test(ua);
  var REFRACT = !isFirefox && !isSafari;

  /* The host has to CONTAIN .lg-layer (position:absolute; inset:0), which
     means it needs a non-static position — but `absolute`, `fixed`, `sticky`
     and `relative` all do that job equally well.

     This used to read `[data-liquid-glass]{position:relative}`, which forced
     relative onto every host. That quietly broke any element the author had
     positioned themselves: this stylesheet is appended at script-execution
     time, and these scripts load in Webflow's FOOTER, so it lands after the
     site stylesheet and wins at equal specificity ([data-liquid-glass] and
     .some-class are both 0,1,0). An absolutely-positioned card would snap
     back into normal flow the moment glass was added to it, with nothing in
     the console to say why.

     So relative is now applied ONLY to hosts that were actually static, via
     a marker attach() sets after reading the author's true computed position.
     It has to be a marker rather than a blanket rule: a blanket rule would
     already have made every host `relative` by the time we looked, so we
     could never tell what the author intended. */
  var css = document.createElement("style");
  css.textContent =
    SELECTOR +
    "{isolation:isolate}" +
    "[data-lg-static]{position:relative}" +
    ".lg-layer{position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1}";
  document.head.appendChild(css);

  var svg = null,
    defs = null,
    uid = 0;
  function ensureSvg() {
    if (svg) return;
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    // Marks this as script-injected: it is a child of <body>, which is also the
    // Barba wrapper, so transition.js's class sync must not count it as authored
    // markup when matching siblings positionally.
    svg.setAttribute("data-lg-defs", "");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    defs = document.createElementNS(NS, "defs");
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  /* ---------- named presets ----------
       Reference one with  data-lg-preset="cta"  on an element.
       Priority: DEFAULTS  <  preset  <  explicit data-lg-* attribute.
       Edit / add your own starter presets here. Tuner-saved presets
       are merged in on top (see loadStoredPresets), so a look you
       save in the tuner becomes usable by name too.               */
  var PRESETS = {
    cta: { press: 1.5, glow: 0.4, specular: 0.85 },
    nav: { press: 0, strength: 30 },
    panel: { press: 0.6, frost: 0.1, glow: 0.3, strength: 34 },
    pill: { press: 1, glow: 0.35 },
  };
  var STORE_KEY = "lgTunerPresets";
  function loadStoredPresets() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      for (var name in saved) PRESETS[name] = saved[name];
    } catch (e) {}
  }
  loadStoredPresets();

  /* An unknown preset name used to fail SILENTLY — the element just took the
     defaults. That is the worst possible failure mode here, because the tuner
     saves presets to localStorage: a name works perfectly on the machine that
     invented it and evaporates on every other device, which for this project
     means the look is right on the designer's laptop and wrong on the kiosk
     tablets. Nothing on screen says so.

     So: warn once per unknown name. The fix is always the same — run
     LiquidGlass.exportPresets() on the machine that has them and paste the
     output into PRESETS above, which makes them permanent and device
     independent. */
  var warnedPresets = {};
  function warnUnknownPreset(name) {
    if (warnedPresets[name] || !window.console) return;
    warnedPresets[name] = true;
    console.warn(
      '[glass] unknown preset "' +
        name +
        '" — falling back to defaults. If you saved it in the tuner it only ' +
        "exists in THIS browser's localStorage; run LiquidGlass.exportPresets() " +
        "and paste the result into PRESETS in glass.js to make it permanent."
    );
  }

  function readOpts(el) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k]; // 1. defaults
    var pname = el.getAttribute("data-lg-preset"); // 2. named preset
    if (pname && PRESETS[pname]) {
      var pre = PRESETS[pname];
      for (var pk in pre) if (pk in DEFAULTS) o[pk] = pre[pk];
    } else if (pname) {
      warnUnknownPreset(pname);
    }
    for (var k2 in DEFAULTS) {
      // 3. explicit attrs win
      var v = el.getAttribute("data-lg-" + k2);
      if (!(v === null || v === "" || isNaN(+v))) o[k2] = +v;
    }
    return o;
  }

  /* ---------- press boost: how the knobs morph while pressed ---------- */
  function pressBoost(o, p) {
    if (!p) return o;
    var b = {};
    for (var k in o) b[k] = o[k];
    var m = o.press;
    b.strength = o.strength * (1 + 0.9 * p * m);
    b.magnify = o.magnify + 8 * p * m;
    b.blur = Math.max(0, o.blur + 2.5 * p * m);
    b.specular = Math.min(1, o.specular * (1 + 0.5 * p * m));
    b.glow = Math.min(1, o.glow + 0.3 * p * m);
    return b;
  }

  /* ---------- rotating light source ----------
     Every host is lit by ONE sweeping light rather than each holding a fixed
     angle: lightPhase is a single global offset added to each element's
     data-lg-lightangle, so the whole page reads as one source travelling
     round it. See the spin loop further down. */
  var lightPhase = 0;

  /* ---------- lighting chrome (box-shadow rig) ---------- */
  function applyChrome(el, o) {
    var a = ((o.lightangle + lightPhase) * Math.PI) / 180;
    var dist = 2.4;
    var ox = (-Math.sin(a) * dist).toFixed(2);
    var oy = (Math.cos(a) * dist).toFixed(2);
    var blur = Math.max(0.3, o.specsize).toFixed(2);
    var spec = o.specular,
      spec2 = spec * 0.5;
    /* INSET LAYERS ONLY. There used to be two cast shadows here scaled by
       data-lg-elevation; both were removed on 2026-08-31 along with the knob.
       Glass no longer lifts itself off the page — if an element needs to, put
       a shadow on a WRAPPER in Webflow, because anything written to box-shadow
       on the host itself is rebuilt from scratch on every refresh. */
    el.style.boxShadow = [
      "inset 0 0 0 " +
        o.rimwidth +
        "px rgba(255,255,255," +
        o.rim.toFixed(3) +
        ")",
      "inset " +
        ox +
        "px " +
        oy +
        "px " +
        blur +
        "px -2px rgba(255,255,255," +
        spec.toFixed(3) +
        ")",
      "inset " +
        -ox +
        "px " +
        -oy +
        "px " +
        blur +
        "px -2px rgba(255,255,255," +
        spec2.toFixed(3) +
        ")",
      "inset 0 -8px 18px -8px rgba(255,255,255,.22)",
    ].join(",");
  }

  /* ---------- surface overlay (frost / inner glow) ---------- */
  function applySurface(st, o) {
    var bgs = [];
    if (o.frost > 0)
      bgs.push(
        "linear-gradient(rgba(255,255,255," +
          (o.frost * 0.35).toFixed(3) +
          "),rgba(255,255,255," +
          (o.frost * 0.35).toFixed(3) +
          "))"
      );
    st.overlay.style.background = bgs.join(",") || "none";
    st.overlay.style.boxShadow =
      o.glow > 0
        ? "inset 0 0 18px -4px rgba(255,255,255," +
          (o.glow * 0.55).toFixed(3) +
          "),inset 0 0 6px -2px rgba(255,255,255," +
          (o.glow * 0.35).toFixed(3) +
          ")"
        : "none";
  }

  /* ---------- SDF + displacement map ---------- */
  function makeSDF(w, h, r) {
    var cx = w / 2,
      cy = h / 2,
      hw = w / 2 - r,
      hh = h / 2 - r;
    return function (px, py) {
      var qx = Math.abs(px - cx) - hw;
      var qy = Math.abs(py - cy) - hh;
      var ax = qx > 0 ? qx : 0,
        ay = qy > 0 ? qy : 0;
      return Math.min(Math.max(qx, qy), 0) + Math.sqrt(ax * ax + ay * ay) - r;
    };
  }

  function buildMap(w, h, r, o) {
    var scale = Math.min(1, Math.sqrt(250000 / (w * h)));
    var mw = Math.max(2, Math.round(w * scale));
    var mh = Math.max(2, Math.round(h * scale));
    var cv = document.createElement("canvas");
    cv.width = mw;
    cv.height = mh;
    var ctx = cv.getContext("2d");
    var img = ctx.createImageData(mw, mh);
    var sdf = makeSDF(w, h, r);
    var cx = w / 2,
      cy = h / 2;
    var disp = new Float32Array(mw * mh * 2);
    var maxLen = 1e-6,
      x,
      y,
      i;
    for (y = 0; y < mh; y++) {
      var py = (y + 0.5) / scale;
      for (x = 0; x < mw; x++) {
        var px = (x + 0.5) / scale;
        var d = -sdf(px, py);
        if (d <= 0) continue;
        i = (y * mw + x) * 2;
        var gx = sdf(px + 1, py) - sdf(px - 1, py);
        var gy = sdf(px, py + 1) - sdf(px, py - 1);
        var gl = Math.sqrt(gx * gx + gy * gy) || 1;
        var t = Math.min(d / o.bevel, 1);
        var rim = (1 - t) * (1 - t);
        var dx = -(gx / gl) * rim * o.strength;
        var dy = -(gy / gl) * rim * o.strength;
        dx += ((cx - px) / cx) * o.magnify;
        dy += ((cy - py) / cy) * o.magnify;
        disp[i] = dx;
        disp[i + 1] = dy;
        var m = Math.max(Math.abs(dx), Math.abs(dy));
        if (m > maxLen) maxLen = m;
      }
    }
    var data = img.data;
    for (y = 0; y < mh; y++) {
      for (x = 0; x < mw; x++) {
        i = (y * mw + x) * 2;
        var j = (y * mw + x) * 4;
        data[j] = Math.round(127.5 + (disp[i] / maxLen) * 127.5);
        data[j + 1] = Math.round(127.5 + (disp[i + 1] / maxLen) * 127.5);
        data[j + 2] = 0;
        data[j + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { url: cv.toDataURL(), scale: maxLen * 2 };
  }

  /* ---------- SVG filter plumbing ---------- */
  function feImage(url, w, h) {
    var fe = document.createElementNS(NS, "feImage");
    fe.setAttribute("href", url);
    fe.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", url);
    fe.setAttribute("x", "0");
    fe.setAttribute("y", "0");
    fe.setAttribute("width", w);
    fe.setAttribute("height", h);
    fe.setAttribute("preserveAspectRatio", "none");
    fe.setAttribute("result", "map");
    return fe;
  }
  function feDisplace(scale, result) {
    var fe = document.createElementNS(NS, "feDisplacementMap");
    fe.setAttribute("in", "SourceGraphic");
    fe.setAttribute("in2", "map");
    fe.setAttribute("scale", scale);
    fe.setAttribute("xChannelSelector", "R");
    fe.setAttribute("yChannelSelector", "G");
    fe.setAttribute("result", result);
    return fe;
  }
  /* One displacement pass for all three channels. This used to split R/G/B
     into three passes at different scales and recomposite them (chromatic
     aberration, data-lg-ca); that knob was removed on 2026-08-31, and with it
     the feColorMatrix/feComposite helpers the split needed. */
  function fillFilter(filter, map, w, h) {
    while (filter.firstChild) filter.removeChild(filter.firstChild);
    filter.appendChild(feImage(map.url, w, h));
    filter.appendChild(feDisplace(map.scale, "rgb"));
  }

  /* ---------- core refresh ---------- */
  var states = new WeakMap();
  // A WeakMap can't be walked, and the spin loop has to re-light every host on
  // every frame, so keep a plain list alongside it. It is pruned in the loop by
  // isConnected rather than on teardown: Barba removes the outgoing container's
  // nodes without telling us, exactly as orb-motion has to handle.
  var hosts = [];
  var raf = 0,
    pending = new Set();
  var frozen = false; // when true, skip displacement-map rebuilds

  function refresh(el) {
    var st = states.get(el);
    if (!st) return;
    var w = el.offsetWidth,
      h = el.offsetHeight;
    if (!w || !h) return;
    var p = st.p || 0;
    var o = pressBoost(readOpts(el), p);
    // The spin loop re-lights from this snapshot every frame, so it never has
    // to re-read attributes off the DOM 60 times a second.
    st.lastO = o;
    st.noSpin = el.getAttribute("data-lg-lightspin") === "0";
    applyChrome(el, o);
    applySurface(st, o);
    // While frozen (e.g. during a size-animating transition) keep the cheap
    // chrome/surface updates but skip rebuilding the displacement map every
    // frame. LiquidGlass.unfreeze() + refreshAll() rebuilds once at the end.
    if (frozen) return;
    if (st.fallback) {
      var f = o.blur > 0 ? "blur(" + o.blur.toFixed(2) + "px)" : "none";
      el.style.webkitBackdropFilter = f;
      el.style.backdropFilter = f;
      return;
    }
    var rr = getComputedStyle(el).borderTopLeftRadius;
    var r = parseFloat(rr) || 0;
    if (String(rr).indexOf("%") > -1) r = Math.min(w, h) * (r / 100);
    r = Math.min(r, Math.min(w, h) / 2);
    var pq = Math.round(p * 40) / 40; // quantise press so springs don't over-rebuild
    var key = [w, h, r, pq]
      .concat(
        REFRACT_KEYS.map(function (k) {
          return o[k];
        })
      )
      .join("|");
    if (key !== st.key) {
      st.key = key;
      fillFilter(st.filter, buildMap(w, h, r, o), w, h);
      st.bf = ""; // the filter's contents changed — re-assert the reference
    }
    // Blur runs as a native backdrop-filter function BEFORE the displacement
    // url(), so the glass refracts an already-softened backdrop. It cannot live
    // inside the SVG chain: that filter's region is pinned to the element box,
    // so an feGaussianBlur there samples transparent past the edge and eats its
    // own rim. Native blur clamps at the edge instead, so the knob reads in
    // real pixels at any value.
    var bf =
      (o.blur > 0 ? "blur(" + o.blur.toFixed(2) + "px) " : "") +
      "url(#" +
      st.id +
      ")";
    if (bf !== st.bf) {
      st.bf = bf;
      el.style.webkitBackdropFilter = bf;
      el.style.backdropFilter = bf;
    }
  }

  function schedule(el) {
    pending.add(el);
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      pending.forEach(refresh);
      pending.clear();
    });
  }

  /* ---------- press spring ---------- */
  var K = 240,
    C = 16; // stiffness / damping -> underdamped, gentle wobble

  function springLoop(el, st) {
    if (st.springRaf) return;
    var last = performance.now();
    function step(now) {
      var dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      var target = st.down ? 1 : 0;
      var x = st.p - target;
      var acc = -K * x - C * st.v;
      st.v += acc * dt;
      st.p += st.v * dt;
      // clamp runaway
      if (st.p > 1.3) {
        st.p = 1.3;
        st.v = 0;
      }
      if (st.p < -0.4) {
        st.p = -0.4;
        st.v = 0;
      }
      var o = readOpts(el);
      var scale = 1 - 0.06 * st.p * o.press;
      // Press is a straight scale. It used to also rotateX/rotateY toward the
      // tap under perspective(600px) — data-lg-tilt, removed 2026-08-31 — which
      // is why nothing here needs the pointer position any more.
      el.style.transform =
        (st.baseTransform ? st.baseTransform + " " : "") +
        "scale(" +
        scale.toFixed(4) +
        ")";
      refresh(el);
      var settled = !st.down && Math.abs(st.p) < 0.004 && Math.abs(st.v) < 0.02;
      if (settled) {
        st.p = 0;
        st.v = 0;
        st.springRaf = 0;
        el.style.transform = st.baseTransform || "";
        refresh(el);
        return;
      }
      st.springRaf = requestAnimationFrame(step);
    }
    st.springRaf = requestAnimationFrame(step);
  }

  function wirePress(el, st) {
    el.addEventListener("pointerdown", function () {
      if (readOpts(el).press <= 0) return;
      st.down = true;
      springLoop(el, st);
    });
    function release() {
      if (!st.down) return;
      st.down = false;
      springLoop(el, st);
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }

  /* ---------- attach / scan ---------- */
  var ro =
    "ResizeObserver" in window
      ? new ResizeObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) schedule(entries[i].target);
        })
      : null;

  function makeLayers(el, st) {
    var overlay = document.createElement("div");
    overlay.className = "lg-layer";
    // Also tag it with an ATTRIBUTE, not just a class: transition.js has to be
    // able to tell script-injected nodes apart from authored Webflow markup when
    // it syncs the shell's classes across a Barba navigation, and a class is the
    // one thing that operation overwrites.
    overlay.setAttribute("data-lg-layer", "");
    el.insertBefore(overlay, el.firstChild);
    st.overlay = overlay;
  }

  function attach(el) {
    if (states.has(el)) return;

    /* Read the author's position BEFORE anything of ours affects it, and only
       step in when the element is static. A host the author placed
       (absolute / fixed / sticky) keeps its own positioning — see the note on
       the stylesheet above.

       Caveat: this is decided once, at attach. An element that only becomes
       static at another breakpoint would keep the marker (harmless) or lack
       it (its overlay would escape). Neither has come up; if it ever does,
       re-check inside the ResizeObserver. */
    if (window.getComputedStyle(el).position === "static")
      el.setAttribute("data-lg-static", "");

    var st = {
      p: 0,
      v: 0,
      down: false,
      springRaf: 0,
      key: "",
      baseTransform: el.style.transform || "",
    };
    if (!REFRACT) {
      st.fallback = true;
      states.set(el, st);
      hosts.push(el);
      makeLayers(el, st);
      wirePress(el, st);
      if (ro) ro.observe(el);
      schedule(el);
      return;
    }
    ensureSvg();
    var id = "lg-" + ++uid;
    var filter = document.createElementNS(NS, "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("x", "0");
    filter.setAttribute("y", "0");
    filter.setAttribute("width", "100%");
    filter.setAttribute("height", "100%");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    defs.appendChild(filter);
    st.id = id;
    st.filter = filter;
    states.set(el, st);
    hosts.push(el);
    makeLayers(el, st);
    wirePress(el, st);
    if (ro) ro.observe(el);
    schedule(el);
  }

  function scan() {
    var els = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < els.length; i++) attach(els[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
  window.addEventListener("resize", function () {
    document.querySelectorAll(SELECTOR).forEach(schedule);
  });

  /* ---------- the light sweep ----------
     Rotates lightPhase 0 -> 360 on an 8-second loop, re-lighting every host
     from its cached opts. This is deliberately NOT a per-element animation:
     one shared phase means one light travelling across the page, and adding
     it to each element's own data-lg-lightangle keeps any authored offset
     between two pieces of glass intact.

     It is cheap because lightangle only feeds applyChrome (a box-shadow
     string). It touches neither the displacement map nor the backdrop-filter,
     so nothing here triggers a rebuild — but it IS a box-shadow repaint per
     host per frame, so if a page ever carries dozens of glass elements this
     is the first thing to turn down.

     Opt out per element with data-lg-lightspin="0" (it keeps its fixed
     angle), or globally with LiquidGlass.lightSpin(0). */
  var SPIN_SECONDS = 8;
  var spinMs = SPIN_SECONDS * 1000;
  var spinRaf = 0,
    spinT0 = 0;

  function spinStep(now) {
    if (!spinT0) spinT0 = now;
    lightPhase = ((((now - spinT0) / spinMs) * 360) % 360 + 360) % 360;
    for (var i = hosts.length - 1; i >= 0; i--) {
      var el = hosts[i];
      if (!el.isConnected) {
        hosts.splice(i, 1); // gone with an outgoing Barba container
        continue;
      }
      var st = states.get(el);
      if (!st || !st.lastO || st.noSpin) continue;
      applyChrome(el, st.lastO);
    }
    spinRaf = requestAnimationFrame(spinStep);
  }

  function startSpin() {
    if (spinRaf || spinMs <= 0) return;
    spinT0 = 0;
    spinRaf = requestAnimationFrame(spinStep);
  }

  // seconds per full revolution; 0 stops the sweep and hands every host back
  // its authored angle. The tuner calls lightSpin(0) on open, or the light-angle
  // dial would be fighting the animation for the same property.
  function lightSpin(seconds) {
    spinMs = (+seconds || 0) * 1000;
    if (spinRaf) {
      cancelAnimationFrame(spinRaf);
      spinRaf = 0;
    }
    if (spinMs > 0) return startSpin();
    lightPhase = 0;
    for (var i = 0; i < hosts.length; i++) {
      var st = states.get(hosts[i]);
      if (st && st.lastO) applyChrome(hosts[i], st.lastO);
    }
  }

  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!reduced || !reduced.matches) startSpin();

  function refreshAll() {
    document.querySelectorAll(SELECTOR).forEach(function (el) {
      var st = states.get(el);
      if (st) st.key = ""; // force displacement rebuild
      schedule(el);
    });
  }
  function reloadPresets() {
    loadStoredPresets();
    warnedPresets = {}; // a name that just arrived should not stay "unknown"
    refreshAll();
  }

  // Print every browser-saved preset as ready-to-paste PRESETS entries.
  function exportPresets() {
    var saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {}
    var order = [];
    for (var dk in DEFAULTS) order.push(dk);
    var out = Object.keys(saved)
      .map(function (name) {
        var v = saved[name];
        var body = order
          .map(function (k) {
            return k + ": " + (v[k] === undefined ? DEFAULTS[k] : v[k]);
          })
          .join(", ");
        return "  '" + name + "': { " + body + " }";
      })
      .join(",\n");
    console.log(out || "(no saved presets)");
    return out;
  }

  // Pause displacement-map rebuilds (call before animating a glass element's
  // size), then unfreeze() + refreshAll() once it settles to rebuild cleanly.
  // Reference-counted so overlapping freezes don't unfreeze prematurely.
  var freezeCount = 0;
  function freeze() {
    freezeCount++;
    frozen = true;
  }
  function unfreeze(rebuild) {
    freezeCount = Math.max(0, freezeCount - 1);
    if (freezeCount === 0) {
      frozen = false;
      if (rebuild !== false) refreshAll();
    }
  }

  window.LiquidGlass = {
    scan: scan,
    refresh: refresh,
    refreshAll: refreshAll,
    freeze: freeze,
    unfreeze: unfreeze,
    reloadPresets: reloadPresets,
    lightSpin: lightSpin,
    exportPresets: exportPresets,
    presets: PRESETS,
  };
})();
