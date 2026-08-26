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
     data-lg-ca          chromatic aberration      (default 1.5)
     data-lg-blur        softening                 (default 2)
     data-lg-saturate    colour boost              (default 1.5)
   LIGHTING knobs:
     data-lg-lightangle  specular direction, deg   (default 315)
     data-lg-specular    highlight brightness      (default 0.75)
     data-lg-specsize    highlight softness, px    (default 1)
     data-lg-rim         edge-light brightness     (default 0.13)
     data-lg-rimwidth    edge thickness, px        (default 1)
     data-lg-elevation   drop-shadow depth mult    (default 1)
   SURFACE knobs (new):
     data-lg-tinthue     tint hue 0-360            (default 90)
     data-lg-tintamount  tint opacity 0-1          (default 0)
     data-lg-frost       milky overlay 0-1         (default 0)
     data-lg-glow        inner caustic band 0-1    (default 0)
   INTERACTION knobs:
     data-lg-press       press-spring depth 0-2    (default 1, 0 = off)
     data-lg-tilt        press tilt max, degrees   (default 7, 0 = off)

   POSITIONING: glass needs a non-static host so its overlay is contained.
         If your element is already absolute / fixed / sticky it is LEFT
         ALONE; only a static one is made relative (marked data-lg-static).

   API: LiquidGlass.scan(), LiquidGlass.refresh(el)
   NOTE: refraction is Chrome/Edge only; lighting, surface,
         press and tilt work in every browser.
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
    ca: 1.5,
    blur: 2,
    saturate: 1.5,
    lightangle: 315,
    specular: 0.75,
    specsize: 1,
    rim: 0.13,
    rimwidth: 1,
    elevation: 1,
    tinthue: 90,
    tintamount: 0,
    frost: 0,
    glow: 0,
    press: 0,
    tilt: 0,
  };
  var REFRACT_KEYS = ["strength", "bevel", "magnify", "ca", "blur", "saturate"];
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
    cta: { press: 1.5, tilt: 12, glow: 0.4, specular: 0.85 },
    nav: { press: 0, tilt: 0, strength: 30, blur: 1.5 },
    panel: { press: 0.6, tilt: 4, frost: 0.1, glow: 0.3, strength: 34 },
    pill: { press: 1, tilt: 8, glow: 0.35 },
  };
  var STORE_KEY = "lgTunerPresets";
  function loadStoredPresets() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      for (var name in saved) PRESETS[name] = saved[name];
    } catch (e) {}
  }
  loadStoredPresets();

  function readOpts(el) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k]; // 1. defaults
    var pname = el.getAttribute("data-lg-preset"); // 2. named preset
    if (pname && PRESETS[pname]) {
      var pre = PRESETS[pname];
      for (var pk in pre) if (pk in DEFAULTS) o[pk] = pre[pk];
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
    b.saturate = o.saturate + 0.35 * p * m;
    b.specular = Math.min(1, o.specular * (1 + 0.5 * p * m));
    b.elevation = Math.max(0, o.elevation * (1 - 0.45 * p * m));
    b.glow = Math.min(1, o.glow + 0.3 * p * m);
    return b;
  }

  /* ---------- lighting chrome (box-shadow rig) ---------- */
  function applyChrome(el, o) {
    var a = (o.lightangle * Math.PI) / 180;
    var dist = 2.4;
    var ox = (-Math.sin(a) * dist).toFixed(2);
    var oy = (Math.cos(a) * dist).toFixed(2);
    var blur = Math.max(0.3, o.specsize).toFixed(2);
    var spec = o.specular,
      spec2 = spec * 0.5,
      e = o.elevation;
    el.style.boxShadow = [
      "0 " +
        (24 * e).toFixed(1) +
        "px " +
        (48 * e).toFixed(1) +
        "px -16px rgba(4,8,28," +
        (0.4 * e).toFixed(3) +
        ")",
      "0 " +
        (4 * e).toFixed(1) +
        "px " +
        (12 * e).toFixed(1) +
        "px -6px rgba(4,8,28," +
        (0.3 * e).toFixed(3) +
        ")",
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

  /* ---------- surface overlay (tint / frost / inner glow) ---------- */
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
    if (o.tintamount > 0)
      bgs.push(
        "linear-gradient(hsla(" +
          o.tinthue +
          ",85%,60%," +
          (o.tintamount * 0.35).toFixed(3) +
          "),hsla(" +
          o.tinthue +
          ",85%,60%," +
          (o.tintamount * 0.35).toFixed(3) +
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
  function feChannel(inName, row, result) {
    var m = ["0 0 0 0 0", "0 0 0 0 0", "0 0 0 0 0"];
    m[row] = row === 0 ? "1 0 0 0 0" : row === 1 ? "0 1 0 0 0" : "0 0 1 0 0";
    var fe = document.createElementNS(NS, "feColorMatrix");
    fe.setAttribute("in", inName);
    fe.setAttribute("type", "matrix");
    fe.setAttribute("values", m[0] + " " + m[1] + " " + m[2] + " 0 0 0 1 0");
    fe.setAttribute("result", result);
    return fe;
  }
  function feAdd(a, b, result) {
    var fe = document.createElementNS(NS, "feComposite");
    fe.setAttribute("in", a);
    fe.setAttribute("in2", b);
    fe.setAttribute("operator", "arithmetic");
    fe.setAttribute("k1", "0");
    fe.setAttribute("k2", "1");
    fe.setAttribute("k3", "1");
    fe.setAttribute("k4", "0");
    fe.setAttribute("result", result);
    return fe;
  }
  function fillFilter(filter, map, w, h, o) {
    while (filter.firstChild) filter.removeChild(filter.firstChild);
    filter.appendChild(feImage(map.url, w, h));
    var last;
    if (o.ca > 0) {
      filter.appendChild(feDisplace(map.scale + 2 * o.ca, "dr"));
      filter.appendChild(feChannel("dr", 0, "cr"));
      filter.appendChild(feDisplace(map.scale, "dg"));
      filter.appendChild(feChannel("dg", 1, "cg"));
      filter.appendChild(feDisplace(Math.max(0, map.scale - 2 * o.ca), "db"));
      filter.appendChild(feChannel("db", 2, "cb"));
      filter.appendChild(feAdd("cr", "cg", "rg"));
      filter.appendChild(feAdd("rg", "cb", "rgb"));
      last = "rgb";
    } else {
      filter.appendChild(feDisplace(map.scale, "rgb"));
      last = "rgb";
    }
    if (o.blur > 0) {
      var fb = document.createElementNS(NS, "feGaussianBlur");
      fb.setAttribute("in", last);
      fb.setAttribute("stdDeviation", o.blur * 0.5);
      fb.setAttribute("result", "soft");
      filter.appendChild(fb);
      last = "soft";
    }
    if (o.saturate !== 1) {
      var fs = document.createElementNS(NS, "feColorMatrix");
      fs.setAttribute("in", last);
      fs.setAttribute("type", "saturate");
      fs.setAttribute("values", String(o.saturate));
      filter.appendChild(fs);
    }
  }

  /* ---------- core refresh ---------- */
  var states = new WeakMap();
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
    applyChrome(el, o);
    applySurface(st, o);
    // While frozen (e.g. during a size-animating transition) keep the cheap
    // chrome/surface updates but skip rebuilding the displacement map every
    // frame. LiquidGlass.unfreeze() + refreshAll() rebuilds once at the end.
    if (frozen) return;
    if (st.fallback) {
      var f =
        "blur(" +
        Math.max(o.blur, 2.5) +
        "px) saturate(" +
        o.saturate.toFixed(3) +
        ")";
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
    if (key === st.key) return;
    st.key = key;
    fillFilter(st.filter, buildMap(w, h, r, o), w, h, o);
    el.style.backdropFilter = "url(#" + st.id + ")";
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
      var rx = (-(st.ny || 0) * o.tilt * st.p).toFixed(3);
      var ry = ((st.nx || 0) * o.tilt * st.p).toFixed(3);
      el.style.transform =
        (st.baseTransform ? st.baseTransform + " " : "") +
        "perspective(600px) rotateX(" +
        rx +
        "deg) rotateY(" +
        ry +
        "deg) scale(" +
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
    el.addEventListener("pointerdown", function (e) {
      var o = readOpts(el);
      if (o.press <= 0 && o.tilt <= 0) return;
      // where was the tap, relative to center? (-1..1 each axis)
      var r = el.getBoundingClientRect();
      st.nx = Math.max(
        -1,
        Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2))
      );
      st.ny = Math.max(
        -1,
        Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2))
      );
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

  function refreshAll() {
    document.querySelectorAll(SELECTOR).forEach(function (el) {
      var st = states.get(el);
      if (st) st.key = ""; // force displacement rebuild
      schedule(el);
    });
  }
  function reloadPresets() {
    loadStoredPresets();
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
    exportPresets: exportPresets,
    presets: PRESETS,
  };
})();
