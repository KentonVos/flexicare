/* ============================================================
   Liquid Glass Tuner v8 — floating control panel for Webflow
   ------------------------------------------------------------
   Plain JS file: source AFTER liquid-glass-v8.js.

   GATED: only appears when the page URL contains "tune",
   e.g.  https://yoursite.webflow.io/?tune
   Force-enable on a browser with:
     localStorage.setItem('lgTunerAlways','1')  (console)
   ============================================================ */
(function () {
  "use strict";

  var GATED = /[?&#]tune\b/.test(location.search + location.hash);
  var FORCED = false;
  try {
    FORCED = localStorage.getItem("lgTunerAlways") === "1";
  } catch (e) {}
  if (!GATED && !FORCED) return;

  var KNOBS = [
    {
      key: "strength",
      label: "Strength",
      min: 0,
      max: 150,
      step: 1,
      group: "Refraction",
    },
    {
      key: "bevel",
      label: "Bevel",
      min: 2,
      max: 120,
      step: 1,
      group: "Refraction",
    },
    {
      key: "magnify",
      label: "Magnify",
      min: 0,
      max: 60,
      step: 1,
      group: "Refraction",
    },
    {
      key: "ca",
      label: "Chromatic",
      min: 0,
      max: 8,
      step: 0.1,
      group: "Refraction",
    },
    {
      key: "blur",
      label: "Blur",
      min: 0,
      max: 10,
      step: 0.1,
      group: "Refraction",
    },
    {
      key: "saturate",
      label: "Saturate",
      min: 0.5,
      max: 3,
      step: 0.05,
      group: "Refraction",
    },
    {
      key: "lightangle",
      label: "Light angle",
      min: 0,
      max: 360,
      step: 1,
      group: "Lighting",
      type: "dial",
    },
    {
      key: "specular",
      label: "Specular",
      min: 0,
      max: 1,
      step: 0.01,
      group: "Lighting",
    },
    {
      key: "specsize",
      label: "Specular softness",
      min: 0,
      max: 6,
      step: 0.1,
      group: "Lighting",
    },
    {
      key: "rim",
      label: "Edge light",
      min: 0,
      max: 1,
      step: 0.01,
      group: "Lighting",
    },
    {
      key: "rimwidth",
      label: "Edge width",
      min: 0,
      max: 4,
      step: 0.5,
      group: "Lighting",
    },
    {
      key: "elevation",
      label: "Elevation",
      min: 0,
      max: 2,
      step: 0.05,
      group: "Lighting",
    },
    {
      key: "tinthue",
      label: "Tint hue",
      min: 0,
      max: 360,
      step: 1,
      group: "Surface",
      hue: true,
    },
    {
      key: "tintamount",
      label: "Tint amount",
      min: 0,
      max: 1,
      step: 0.01,
      group: "Surface",
    },
    {
      key: "frost",
      label: "Frost",
      min: 0,
      max: 1,
      step: 0.01,
      group: "Surface",
    },
    {
      key: "glow",
      label: "Inner glow",
      min: 0,
      max: 1,
      step: 0.01,
      group: "Surface",
    },
    {
      key: "press",
      label: "Press depth",
      min: 0,
      max: 2,
      step: 0.05,
      group: "Interaction",
    },
    {
      key: "tilt",
      label: "Press tilt",
      min: 0,
      max: 20,
      step: 0.5,
      group: "Interaction",
    },
  ];
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
    press: 1,
    tilt: 7,
  };
  var SELECTOR = "[data-liquid-glass]";
  var STORE_KEY = "lgTunerPresets";

  var tries = 0;
  (function waitReady() {
    if (window.LiquidGlass && typeof window.LiquidGlass.refresh === "function")
      return init();
    if (tries++ > 100) return init();
    setTimeout(waitReady, 100);
  })();

  function refresh(el) {
    if (window.LiquidGlass && window.LiquidGlass.refresh)
      window.LiquidGlass.refresh(el);
  }
  function getPresets() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function setPresets(p) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(p));
    } catch (e) {}
  }

  function readVals(el) {
    var o = {};
    KNOBS.forEach(function (k) {
      var v = el ? el.getAttribute("data-lg-" + k.key) : null;
      o[k.key] = v === null || v === "" || isNaN(+v) ? DEFAULTS[k.key] : +v;
    });
    return o;
  }
  function fmt(k, v) {
    if (k.key === "lightangle" || k.key === "tinthue")
      return Math.round(v) + "\u00B0";
    return k.step < 1 ? (+v).toFixed(k.step < 0.1 ? 2 : 1) : String(v);
  }

  function init() {
    var els = Array.prototype.slice.call(document.querySelectorAll(SELECTOR));

    var style = document.createElement("style");
    style.textContent = [
      "#lgt-fab{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:52px;height:52px;",
      "border-radius:50%;border:none;cursor:pointer;background:#c6f24e;color:#06210a;font:600 12px/1 system-ui,sans-serif;",
      "box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;transition:transform .15s}",
      "#lgt-fab:hover{transform:scale(1.06)}",
      "#lgt-panel{position:fixed;right:18px;bottom:82px;z-index:2147483647;width:300px;max-height:82vh;overflow:auto;",
      "background:rgba(14,16,26,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);",
      "border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:16px;color:#eef;",
      "font:13px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.5);display:none}",
      "#lgt-panel.open{display:block}",
      "#lgt-panel h3{margin:0 0 12px;font-size:14px;font-weight:700;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;touch-action:none}",
      "#lgt-panel h3 .grip{opacity:.4;font-weight:400;margin-right:6px}",
      "#lgt-panel .x{cursor:pointer;opacity:.6;font-size:18px;line-height:1}#lgt-panel .x:hover{opacity:1}",
      "#lgt-panel label.blk{display:block;margin:12px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.6}",
      "#lgt-panel .grp{margin:16px 0 2px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#c6f24e}",
      "#lgt-panel select,#lgt-panel input[type=text]{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);",
      "border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#eef;padding:7px 9px;font:13px system-ui}",
      "#lgt-panel .row{margin:10px 0}",
      "#lgt-panel .row .top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px}",
      "#lgt-panel .row .top b{font-weight:600}#lgt-panel .row .top span{opacity:.7;font-variant-numeric:tabular-nums}",
      "#lgt-panel input[type=range]{width:100%;accent-color:#c6f24e;margin:0}",
      "#lgt-panel input[type=range].hue{height:12px;border-radius:6px;-webkit-appearance:none;appearance:none;",
      "background:linear-gradient(90deg,#f55 0,#ff5 60px,#5f5 120px,#5ff 180px,#55f 240px,#f5f 300px,#f55 100%)}",
      "#lgt-panel .dialwrap{display:flex;justify-content:center;margin:6px 0 2px}",
      "#lgt-panel .dial{position:relative;width:76px;height:76px;border-radius:50%;cursor:pointer;",
      "background:radial-gradient(circle at 50% 42%,rgba(198,242,78,.18),rgba(255,255,255,.03));",
      "border:1px solid rgba(255,255,255,.18);touch-action:none}",
      '#lgt-panel .dial::after{content:"";position:absolute;inset:0;margin:auto;width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.4)}',
      "#lgt-panel .dh{position:absolute;width:12px;height:12px;border-radius:50%;background:#c6f24e;box-shadow:0 0 8px rgba(198,242,78,.8);pointer-events:none}",
      "#lgt-panel .btns{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}",
      "#lgt-panel button.mini{flex:1;min-width:64px;cursor:pointer;background:rgba(255,255,255,.08);",
      "border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#eef;padding:7px 8px;font:600 12px system-ui}",
      "#lgt-panel button.mini:hover{background:rgba(255,255,255,.16)}",
      "#lgt-panel button.mini.go{background:#c6f24e;color:#06210a;border-color:#c6f24e}",
      "#lgt-panel hr{border:none;border-top:1px solid rgba(255,255,255,.1);margin:14px 0}",
      "#lgt-panel .note{font-size:11px;opacity:.55;margin-top:6px;min-height:14px}",
    ].join("");
    document.head.appendChild(style);

    var fab = document.createElement("button");
    fab.id = "lgt-fab";
    fab.type = "button";
    fab.textContent = "Glass";
    fab.setAttribute("aria-label", "Toggle liquid glass tuner");
    document.body.appendChild(fab);

    var panel = document.createElement("div");
    panel.id = "lgt-panel";
    document.body.appendChild(panel);

    var targetOptions = ['<option value="all">All elements at once</option>'];
    els.forEach(function (el, i) {
      var name =
        el.id ||
        el.tagName.toLowerCase() +
          " — " +
          (el.textContent || "").trim().slice(0, 22) ||
        "element " + (i + 1);
      targetOptions.push(
        '<option value="' + i + '">' + name.replace(/</g, "&lt;") + "</option>"
      );
    });

    var lastGroup = "";
    var rowsHTML = KNOBS.map(function (k) {
      var head = "";
      if (k.group !== lastGroup) {
        head = '<div class="grp">' + k.group + "</div>";
        lastGroup = k.group;
      }
      if (k.type === "dial") {
        return (
          head +
          '<div class="row dial-row" data-k="' +
          k.key +
          '">' +
          '<div class="top"><b>' +
          k.label +
          '</b><span class="val"></span></div>' +
          '<div class="dialwrap"><div class="dial"><div class="dh"></div></div></div>' +
          '<input type="range" min="' +
          k.min +
          '" max="' +
          k.max +
          '" step="' +
          k.step +
          '" style="display:none">' +
          "</div>"
        );
      }
      return (
        head +
        '<div class="row" data-k="' +
        k.key +
        '">' +
        '<div class="top"><b>' +
        k.label +
        '</b><span class="val"></span></div>' +
        '<input type="range" ' +
        (k.hue ? 'class="hue" ' : "") +
        'min="' +
        k.min +
        '" max="' +
        k.max +
        '" step="' +
        k.step +
        '">' +
        "</div>"
      );
    }).join("");

    panel.innerHTML =
      '<h3><span><span class="grip">\u22EE\u22EE</span>Liquid Glass Tuner</span><span class="x" id="lgt-close">×</span></h3>' +
      '<label class="blk">Editing</label>' +
      '<select id="lgt-target">' +
      targetOptions.join("") +
      "</select>" +
      rowsHTML +
      '<div class="btns"><button class="mini" id="lgt-reset">Reset</button>' +
      '<button class="mini" id="lgt-copy">Copy attributes</button></div>' +
      '<div class="btns"><button class="mini go" id="lgt-copypreset">Copy as preset (paste into script)</button></div>' +
      '<hr><label class="blk">Presets</label>' +
      '<select id="lgt-preset"><option value="">— choose a preset —</option></select>' +
      '<div class="btns"><button class="mini" id="lgt-load">Load to sliders</button>' +
      '<button class="mini go" id="lgt-assign">Assign to element</button></div>' +
      '<div class="btns"><button class="mini" id="lgt-save">Save current as…</button>' +
      '<button class="mini" id="lgt-del">Delete</button></div>' +
      '<div class="btns"><button class="mini go" id="lgt-update">Update current preset</button></div>' +
      '<div class="note" id="lgt-note"></div>';

    var targetSel = panel.querySelector("#lgt-target");
    var presetSel = panel.querySelector("#lgt-preset");
    var note = panel.querySelector("#lgt-note");
    var rows = {};
    KNOBS.forEach(function (k) {
      var row = panel.querySelector('.row[data-k="' + k.key + '"]');
      rows[k.key] = {
        range: row.querySelector("input"),
        val: row.querySelector(".val"),
      };
    });

    function currentEls() {
      return targetSel.value === "all" ? els : [els[+targetSel.value]];
    }
    function repEl() {
      return targetSel.value === "all" ? els[0] : els[+targetSel.value];
    }

    var prevEl = null,
      prevOutline = null,
      prevOffset = null;
    function highlight() {
      if (prevEl && prevEl.style) {
        prevEl.style.outline = prevOutline || "";
        prevEl.style.outlineOffset = prevOffset || "";
      }
      prevEl = null;
      if (targetSel.value !== "all" && els[+targetSel.value]) {
        prevEl = els[+targetSel.value];
        prevOutline = prevEl.style.outline;
        prevOffset = prevEl.style.outlineOffset;
        prevEl.style.outline = "1px dotted rgba(198,242,78,0.5)";
        prevEl.style.outlineOffset = "15px";
      }
    }
    function clearHighlight() {
      if (prevEl && prevEl.style) {
        prevEl.style.outline = prevOutline || "";
        prevEl.style.outlineOffset = prevOffset || "";
      }
      prevEl = null;
    }

    var pendingApply = false,
      applySet = new Set();
    function apply(el, key, value) {
      el.setAttribute("data-lg-" + key, value);
      applySet.add(el);
      if (pendingApply) return;
      pendingApply = true;
      requestAnimationFrame(function () {
        pendingApply = false;
        applySet.forEach(refresh);
        applySet.clear();
      });
    }

    function loadIntoSliders(vals) {
      KNOBS.forEach(function (k) {
        rows[k.key].range.value = vals[k.key];
        rows[k.key].val.textContent = fmt(k, vals[k.key]);
        if (rows[k.key].place) rows[k.key].place(+vals[k.key]);
      });
    }

    KNOBS.forEach(function (k) {
      if (k.type === "dial") return;
      rows[k.key].range.addEventListener("input", function () {
        var v = this.value;
        rows[k.key].val.textContent = fmt(k, v);
        currentEls().forEach(function (el) {
          if (el) apply(el, k.key, v);
        });
      });
    });

    panel.querySelectorAll(".dial-row").forEach(function (row) {
      var key = row.getAttribute("data-k");
      var dial = row.querySelector(".dial");
      var dh = row.querySelector(".dh");
      var range = row.querySelector("input");
      var R = 30,
        C = 38;
      function place(deg) {
        var a = (deg * Math.PI) / 180;
        dh.style.left = C + R * Math.sin(a) - 6 + "px";
        dh.style.top = C - R * Math.cos(a) - 6 + "px";
      }
      function fromEvent(e) {
        var r = dial.getBoundingClientRect();
        var dx = e.clientX - (r.left + C),
          dy = e.clientY - (r.top + C);
        var deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
        if (deg < 0) deg += 360;
        deg = Math.round(deg);
        range.value = deg;
        place(deg);
        rows[key].val.textContent = deg + "\u00B0";
        currentEls().forEach(function (el) {
          if (el) apply(el, key, deg);
        });
      }
      var dragging = false;
      dial.addEventListener("pointerdown", function (e) {
        dragging = true;
        try {
          dial.setPointerCapture(e.pointerId);
        } catch (x) {}
        fromEvent(e);
      });
      dial.addEventListener("pointermove", function (e) {
        if (dragging) fromEvent(e);
      });
      dial.addEventListener("pointerup", function () {
        dragging = false;
      });
      dial.addEventListener("pointercancel", function () {
        dragging = false;
      });
      rows[key].place = place;
    });

    targetSel.addEventListener("change", function () {
      loadIntoSliders(readVals(repEl()));
      highlight();
    });

    panel.querySelector("#lgt-reset").addEventListener("click", function () {
      loadIntoSliders(DEFAULTS);
      currentEls().forEach(function (el) {
        if (!el) return;
        KNOBS.forEach(function (k) {
          el.setAttribute("data-lg-" + k.key, DEFAULTS[k.key]);
        });
        refresh(el);
      });
      flash("Reset to defaults");
    });

    panel.querySelector("#lgt-copy").addEventListener("click", function () {
      var lines = KNOBS.map(function (k) {
        return "data-lg-" + k.key + '="' + rows[k.key].range.value + '"';
      });
      var text = 'data-liquid-glass="true" ' + lines.join(" ");
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      flash("Copied — paste into the Designer");
    });

    // Copy the current slider values as a ready-to-paste PRESETS entry.
    panel
      .querySelector("#lgt-copypreset")
      .addEventListener("click", function () {
        var name =
          presetSel.value || prompt("Preset name (the data-lg-preset value):");
        if (!name) return;
        var body = KNOBS.map(function (k) {
          var v = +rows[k.key].range.value;
          return k.key + ": " + v;
        }).join(", ");
        var entry = "  '" + name + "': { " + body + " },";
        if (navigator.clipboard) navigator.clipboard.writeText(entry);
        flash("Copied preset '" + name + "' — paste inside PRESETS { }");
      });

    // built-in presets shipped in the main script (read-only here)
    function builtIns() {
      return (window.LiquidGlass && window.LiquidGlass.presets) || {};
    }

    function refreshPresetList() {
      var saved = getPresets(),
        bi = builtIns();
      var opts = ['<option value="">— choose a preset —</option>'];
      Object.keys(bi).forEach(function (n) {
        if (saved[n]) return; // saved overrides same-named built-in; list once below
        opts.push(
          '<option value="' +
            n.replace(/"/g, "&quot;") +
            '">' +
            n.replace(/</g, "&lt;") +
            " (built-in)</option>"
        );
      });
      Object.keys(saved).forEach(function (n) {
        opts.push(
          '<option value="' +
            n.replace(/"/g, "&quot;") +
            '">' +
            n.replace(/</g, "&lt;") +
            "</option>"
        );
      });
      presetSel.innerHTML = opts.join("");
    }
    refreshPresetList();

    function presetValues(name) {
      var v = getPresets()[name] || builtIns()[name];
      if (!v) return null;
      var full = {};
      KNOBS.forEach(function (k) {
        full[k.key] = v[k.key] === undefined ? DEFAULTS[k.key] : v[k.key];
      });
      return full;
    }

    // Load to sliders: preview values without touching the element's attributes
    panel.querySelector("#lgt-load").addEventListener("click", function () {
      if (!presetSel.value) return flash("Pick a preset first");
      var vals = presetValues(presetSel.value);
      if (!vals) return;
      loadIntoSliders(vals);
      currentEls().forEach(function (el) {
        if (!el) return;
        KNOBS.forEach(function (k) {
          el.setAttribute("data-lg-" + k.key, vals[k.key]);
        });
        refresh(el);
      });
      flash('Loaded "' + presetSel.value + '" onto element(s)');
    });

    // Assign to element: the seamless route — set data-lg-preset, clear explicit
    // overrides so the named preset shows through. Copies the markup too.
    panel.querySelector("#lgt-assign").addEventListener("click", function () {
      if (!presetSel.value) return flash("Pick a preset first");
      var name = presetSel.value;
      currentEls().forEach(function (el) {
        if (!el) return;
        KNOBS.forEach(function (k) {
          el.removeAttribute("data-lg-" + k.key);
        });
        el.setAttribute("data-lg-preset", name);
        refresh(el);
      });
      var ref = 'data-liquid-glass="true" data-lg-preset="' + name + '"';
      if (navigator.clipboard) navigator.clipboard.writeText(ref);
      loadIntoSliders(readVals(repEl()));
      flash('Assigned + copied: data-lg-preset="' + name + '"');
    });

    panel.querySelector("#lgt-save").addEventListener("click", function () {
      var name = prompt("Save current values as preset name:");
      if (!name) return;
      var p = getPresets(),
        vals = {};
      KNOBS.forEach(function (k) {
        vals[k.key] = +rows[k.key].range.value;
      });
      p[name] = vals;
      setPresets(p);
      if (window.LiquidGlass && window.LiquidGlass.reloadPresets)
        window.LiquidGlass.reloadPresets();
      refreshPresetList();
      presetSel.value = name;
      flash(
        'Saved "' + name + '" — now usable as data-lg-preset="' + name + '"'
      );
    });

    panel.querySelector("#lgt-del").addEventListener("click", function () {
      if (!presetSel.value) return flash("Pick a preset to delete");
      if (!getPresets()[presetSel.value])
        return flash("Built-in presets can\u2019t be deleted");
      var p = getPresets();
      delete p[presetSel.value];
      setPresets(p);
      if (window.LiquidGlass && window.LiquidGlass.reloadPresets)
        window.LiquidGlass.reloadPresets();
      refreshPresetList();
      flash("Deleted");
    });

    // Overwrite the selected preset with the current slider values, re-register
    // it, and live-refresh every element that references it by name.
    panel.querySelector("#lgt-update").addEventListener("click", function () {
      var name = presetSel.value;
      if (!name) return flash("Pick a preset to update first");
      if (!getPresets()[name] && builtIns()[name]) {
        return flash(
          'Built-in "' + name + '" is read-only — use Save current as…'
        );
      }
      var p = getPresets(),
        vals = {};
      KNOBS.forEach(function (k) {
        vals[k.key] = +rows[k.key].range.value;
      });
      p[name] = vals;
      setPresets(p);
      if (window.LiquidGlass && window.LiquidGlass.reloadPresets)
        window.LiquidGlass.reloadPresets();
      refreshPresetList();
      presetSel.value = name;
      flash('Updated "' + name + '" — elements using it refreshed');
    });

    var noteTimer;
    function flash(msg) {
      note.textContent = msg;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () {
        note.textContent = "";
      }, 2200);
    }

    function open() {
      panel.classList.add("open");
      highlight();
    }
    function close() {
      panel.classList.remove("open");
      clearHighlight();
    }
    fab.addEventListener("click", function () {
      panel.classList.contains("open") ? close() : open();
    });
    panel.querySelector("#lgt-close").addEventListener("click", close);

    // --- drag the panel by its header ---
    (function () {
      var header = panel.querySelector("h3");
      var dragging = false,
        sx = 0,
        sy = 0,
        ox = 0,
        oy = 0;
      function move(e) {
        if (!dragging) return;
        var nx = ox + (e.clientX - sx);
        var ny = oy + (e.clientY - sy);
        nx = Math.max(
          4,
          Math.min(window.innerWidth - panel.offsetWidth - 4, nx)
        );
        ny = Math.max(4, Math.min(window.innerHeight - 40, ny));
        panel.style.left = nx + "px";
        panel.style.top = ny + "px";
      }
      function end() {
        dragging = false;
      }
      header.addEventListener("pointerdown", function (e) {
        if (e.target.id === "lgt-close") return;
        dragging = true;
        var r = panel.getBoundingClientRect();
        panel.style.right = "auto";
        panel.style.bottom = "auto";
        panel.style.left = r.left + "px";
        panel.style.top = r.top + "px";
        ox = r.left;
        oy = r.top;
        sx = e.clientX;
        sy = e.clientY;
        e.preventDefault();
      });
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    })();

    loadIntoSliders(readVals(repEl()));
    if (!els.length) flash("No [data-liquid-glass] elements found yet");
  }
})();
