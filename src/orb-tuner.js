/* ============================================================
   Orb Motion Tuner v1 — live control panel for orb-motion.js
   ------------------------------------------------------------
   Plain JS. Load AFTER orb-motion.js. Dev-only, like slider.js.

   GATED: only appears when the URL contains "orbtune" or "tune",
   e.g.  https://yoursite.webflow.io/?orbtune
   Force-enable on a browser with:
     localStorage.setItem('orbTunerAlways','1')   (console)

   Sits bottom-right next to the glass tuner's FAB, so ?tune can
   show both panels at once without them overlapping.

   HOW IT APPLIES A VALUE
   ------------------------------------------------------------
   orb-motion.js reads its data-* attributes once, when it attaches.
   So the tuner writes the attribute, calls OrbMotion.kill(el) and
   then OrbMotion.refresh() to re-attach from scratch. That means
   every change RESTARTS that element's motion -- a visible jump
   mid-drag. It's a tuner, not a production animation path; the
   trade is worth it because what you're tuning is then exactly what
   the attributes will do on a fresh load, with no drift between the
   panel and the real thing.

   It can also ATTACH a behaviour to an element that doesn't carry
   the attribute yet -- pick the element in the group's dropdown and
   the base attribute is added live. Nothing is ever removed from
   another element, so the panel can't quietly dismantle a setup.

   "Copy attributes" gives back exactly what to paste into the
   Webflow Designer, grouped per element and skipping anything still
   at its default.
   ============================================================ */
(function () {
  "use strict";

  var GATED = /[?&#](orbtune|tune)\b/.test(location.search + location.hash);
  var FORCED = false;
  try {
    FORCED = localStorage.getItem("orbTunerAlways") === "1";
  } catch (e) {}
  if (!GATED && !FORCED) return;

  if (!window.OrbMotion) {
    console.warn("[OrbTuner] OrbMotion not found — load orb-motion.js first.");
    return;
  }
  var OM = window.OrbMotion;
  var C = OM.config;

  /* ---------- what we can tune ---------- */
  // d = default, taken from OrbMotion.config so the two can't drift apart.
  var GROUPS = [
    {
      key: "path",
      attr: "data-orb-path",
      label: "Path — outer drift + spin",
      knobs: [
        { k: "x", min: 0, max: 200, step: 1, d: C.path.x },
        { k: "y", min: 0, max: 200, step: 1, d: C.path.y },
        { k: "duration", min: 4, max: 90, step: 1, d: C.path.duration },
        { k: "spin", min: 0, max: 300, step: 1, d: C.path.spin },
      ],
      picks: [
        {
          k: "direction",
          d: C.path.direction,
          options: ["cw", "ccw"],
        },
      ],
    },
    {
      key: "squish",
      attr: "data-orb-squish",
      hint: "Belongs on the shared ancestor (orb-wrapper), not on the glass.",
      label: "Squish — the membrane",
      knobs: [
        { k: "radius", min: 0, max: 40, step: 1, d: C.squish.radius },
        { k: "scale", min: 0, max: 0.4, step: 0.01, d: C.squish.scale },
        { k: "skew", min: 0, max: 20, step: 0.5, d: C.squish.skew },
        { k: "duration", min: 1, max: 30, step: 0.5, d: C.squish.duration },
      ],
      picks: [
        { k: "organic", d: C.squish.organic, options: ["1", "0"] },
        { k: "uniform", d: C.squish.uniform, options: ["0", "1"] },
      ],
    },
    {
      key: "warp",
      attr: "data-orb-warp",
      hint: "Must be the glass element ITSELF. On an ancestor it makes that ancestor a backdrop root and the glass loses its refraction.",
      label: "Warp — non-affine silhouette",
      knobs: [
        { k: "scale", min: 0, max: 120, step: 1, d: C.warp.scale },
        // 4 decimals: this one lives in the thousandths, and a slider that
        // rounded it to 2 would only ever offer 0.00 or 0.01.
        { k: "detail", min: 0.001, max: 0.03, step: 0.0002, dp: 4, d: C.warp.detail },
        { k: "octaves", min: 1, max: 4, step: 1, d: C.warp.octaves },
        { k: "speed", min: 4, max: 60, step: 1, d: C.warp.speed },
        { k: "drift", min: 0, max: 400, step: 5, d: C.warp.drift },
        { k: "pulse", min: 0, max: 1, step: 0.05, d: C.warp.pulse },
        { k: "smooth", min: 0, max: 20, step: 0.5, d: C.warp.smooth },
      ],
    },
    {
      key: "float",
      attr: "data-orb-float",
      hint: "\u201cAll\u201d drives every float element together, which FLATTENS per-element differences (two different follow values become one). Pick a single element to tune it alone.",
      label: "Float — inner layers",
      multi: true, // usually several glows; default to driving them together
      knobs: [
        { k: "x", min: 0, max: 160, step: 1, d: C.float.x },
        { k: "y", min: 0, max: 160, step: 1, d: C.float.y },
        { k: "scale", min: 0, max: 0.4, step: 0.01, d: C.float.scale },
        { k: "duration", min: 3, max: 60, step: 0.5, d: C.float.duration },
        { k: "spin", min: 0, max: 300, step: 1, d: C.float.spin },
        { k: "radius", min: 0, max: 40, step: 1, d: C.float.radius },
        { k: "follow", min: 0, max: 2, step: 0.05, d: C.float.follow },
      ],
    },
  ];

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function attrOf(g, k) {
    return g.attr + "-" + k;
  }
  function dp(knob) {
    if (knob.dp) return knob.dp;
    return knob.step >= 1 ? 0 : String(knob.step).split(".")[1].length;
  }
  function fmt(knob, v) {
    return Number(v).toFixed(dp(knob));
  }
  function label(el) {
    if (el.id) return "#" + el.id;
    var c = (el.getAttribute("class") || "").trim().split(/\s+/)[0];
    return c ? "." + c : el.tagName.toLowerCase();
  }

  /* ---------- candidate elements ---------- */
  // Everything already wired, plus anything class-named like the orb, so a
  // behaviour can be attached to an element that has no attribute yet.
  function candidates() {
    var sel =
      OM.selector + ',[class*="orb"],[class*="glass"],[class*="glow"]';
    var seen = [];
    Array.prototype.slice
      .call(document.querySelectorAll(sel))
      .forEach(function (el) {
        if (seen.indexOf(el) < 0) seen.push(el);
      });
    return seen;
  }

  /* ---------- state: current value per group/knob ---------- */
  var state = {};
  var targets = {};

  function seedState() {
    GROUPS.forEach(function (g) {
      state[g.key] = {};
      var live = document.querySelectorAll("[" + g.attr + "]");
      var src = live[0] || null;
      (g.knobs || []).forEach(function (knob) {
        var v = src && src.getAttribute(attrOf(g, knob.k));
        state[g.key][knob.k] =
          v === null || v === "" || isNaN(parseFloat(v))
            ? knob.d
            : parseFloat(v);
      });
      (g.picks || []).forEach(function (p) {
        var v = src && src.getAttribute(attrOf(g, p.k));
        state[g.key][p.k] = v === null || v === "" ? String(p.d) : String(v);
      });
      // Default target: whatever already carries the attribute.
      targets[g.key] = g.multi ? "all" : src ? src : null;
    });
  }

  function targetEls(g) {
    var t = targets[g.key];
    if (t === "all")
      return Array.prototype.slice.call(
        document.querySelectorAll("[" + g.attr + "]")
      );
    return t ? [t] : [];
  }

  /* ---------- apply ---------- */
  var pending = {};
  var raf = 0;

  function applyGroup(g) {
    pending[g.key] = g;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var groups = pending;
      pending = {};
      Object.keys(groups).forEach(function (key) {
        var gg = groups[key];
        targetEls(gg).forEach(function (el) {
          el.setAttribute(gg.attr, "");
          (gg.knobs || []).forEach(function (knob) {
            el.setAttribute(attrOf(gg, knob.k), fmt(knob, state[key][knob.k]));
          });
          (gg.picks || []).forEach(function (p) {
            el.setAttribute(attrOf(gg, p.k), state[key][p.k]);
          });
          // orb-motion reads attributes only when it attaches, so the element
          // has to be torn down and rebuilt for a change to take.
          OM.kill(el);
        });
      });
      OM.refresh(document);
    });
  }

  /* ---------- panel ---------- */
  function init() {
    // Idempotent: a second evaluation (script listed twice, or re-injected on a
    // navigation) would otherwise stack a second FAB and panel on top of the
    // first and re-seed state out from under whatever you were dragging.
    if (document.getElementById("obt-fab")) return;

    var style = document.createElement("style");
    style.textContent = [
      "#obt-fab{position:fixed;right:82px;bottom:18px;z-index:2147483646;width:52px;height:52px;",
      "border-radius:50%;border:none;cursor:pointer;background:#4ec9f2;color:#04202a;font:600 12px/1 system-ui,sans-serif;",
      "box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;transition:transform .15s}",
      "#obt-fab:hover{transform:scale(1.06)}",
      "#obt-panel{position:fixed;right:18px;bottom:82px;z-index:2147483646;width:318px;max-height:84vh;overflow:auto;",
      "background:rgba(12,18,26,.93);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);",
      "border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:16px;color:#eef;",
      "font:13px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.5);display:none}",
      "#obt-panel.open{display:block}",
      "#obt-panel h3{margin:0 0 10px;font-size:14px;font-weight:700;display:flex;justify-content:space-between;",
      "align-items:center;cursor:move;user-select:none;touch-action:none}",
      "#obt-panel h3 .grip{opacity:.4;font-weight:400;margin-right:6px}",
      "#obt-panel .x{cursor:pointer;opacity:.6;font-size:18px;line-height:1}#obt-panel .x:hover{opacity:1}",
      "#obt-panel details{margin:10px 0 0;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}",
      "#obt-panel summary{cursor:pointer;font:700 11px system-ui;text-transform:uppercase;letter-spacing:.08em;color:#4ec9f2;outline:none}",
      "#obt-panel select{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);margin:8px 0 2px;",
      "border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#eef;padding:6px 8px;font:12px system-ui}",
      "#obt-panel .row{margin:8px 0}",
      "#obt-panel .row .top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px}",
      "#obt-panel .row .top span{opacity:.7;font-variant-numeric:tabular-nums}",
      "#obt-panel input[type=range]{width:100%;accent-color:#4ec9f2;margin:0}",
      "#obt-panel .btns{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}",
      "#obt-panel button.mini{flex:1;min-width:64px;cursor:pointer;background:rgba(255,255,255,.08);",
      "border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#eef;padding:7px 8px;font:600 12px system-ui}",
      "#obt-panel button.mini:hover{background:rgba(255,255,255,.16)}",
      "#obt-panel button.mini.go{background:#4ec9f2;color:#04202a;border-color:#4ec9f2}",
      "#obt-panel .note{font-size:11px;opacity:.6;margin-top:8px;min-height:14px}",
      "#obt-panel .warn{color:#ffd166;font-size:11px;margin-top:6px}",
      "#obt-panel textarea{width:100%;box-sizing:border-box;height:120px;margin-top:8px;background:rgba(0,0,0,.35);",
      "border:1px solid rgba(255,255,255,.14);border-radius:8px;color:#cfe;padding:8px;font:11px/1.5 ui-monospace,monospace}",
    ].join("");
    document.head.appendChild(style);

    var fab = document.createElement("button");
    fab.id = "obt-fab";
    fab.type = "button";
    fab.textContent = "Orb";
    fab.setAttribute("aria-label", "Toggle orb motion tuner");
    // Script-injected into persistent DOM — tag it so transition.js's shell
    // class sync treats it as ours, not as authored Webflow markup.
    fab.setAttribute("data-js-injected", "");
    document.body.appendChild(fab);

    var panel = document.createElement("div");
    panel.id = "obt-panel";
    panel.setAttribute("data-js-injected", "");
    document.body.appendChild(panel);

    var cands = candidates();
    function optionsFor(g) {
      var out = g.multi
        ? ['<option value="all">All [' + g.attr + "] elements</option>"]
        : ['<option value="">(not applied)</option>'];
      cands.forEach(function (el, i) {
        var has = el.hasAttribute(g.attr);
        out.push(
          '<option value="' +
            i +
            '"' +
            (!g.multi && targets[g.key] === el ? " selected" : "") +
            ">" +
            label(el) +
            (has ? " ✓" : "") +
            "</option>"
        );
      });
      return out.join("");
    }

    var html = [
      "<h3><span><span class='grip'>⠿</span>Orb Motion</span><span class='x' id='obt-x'>×</span></h3>",
    ];
    if (reduceMotion)
      html.push(
        "<div class='warn'>prefers-reduced-motion is ON, so orb-motion disables " +
          "every animation. Turn it off in your OS display settings or nothing here " +
          "will move.</div>"
      );

    GROUPS.forEach(function (g) {
      var rows = (g.knobs || [])
        .map(function (knob) {
          var v = state[g.key][knob.k];
          return (
            "<div class='row' data-g='" +
            g.key +
            "' data-k='" +
            knob.k +
            "'><div class='top'><b>" +
            knob.k +
            "</b><span>" +
            fmt(knob, v) +
            "</span></div><input type='range' min='" +
            knob.min +
            "' max='" +
            knob.max +
            "' step='" +
            knob.step +
            "' value='" +
            v +
            "'></div>"
          );
        })
        .join("");
      var picks = (g.picks || [])
        .map(function (p) {
          return (
            "<div class='row'><div class='top'><b>" +
            p.k +
            "</b></div><select data-g='" +
            g.key +
            "' data-pick='" +
            p.k +
            "'>" +
            p.options
              .map(function (o) {
                return (
                  "<option value='" +
                  o +
                  "'" +
                  (String(state[g.key][p.k]) === o ? " selected" : "") +
                  ">" +
                  o +
                  "</option>"
                );
              })
              .join("") +
            "</select></div>"
          );
        })
        .join("");
      html.push(
        "<details" +
          (g.key === "warp" ? " open" : "") +
          "><summary>" +
          g.label +
          "</summary><select data-target='" +
          g.key +
          "'>" +
          optionsFor(g) +
          "</select>" +
          (g.hint ? "<div class='note'>" + g.hint + "</div>" : "") +
          rows +
          picks +
          "</details>"
      );
    });

    html.push(
      "<div class='btns'><button class='mini' id='obt-reset'>Reset</button>" +
        "<button class='mini go' id='obt-copy'>Copy attributes</button></div>" +
        "<div class='note' id='obt-note'></div><textarea id='obt-out' readonly " +
        "placeholder='Copy attributes writes the Webflow-ready list here.'></textarea>"
    );
    panel.innerHTML = html.join("");

    var note = panel.querySelector("#obt-note");
    function say(msg) {
      note.textContent = msg;
    }

    fab.addEventListener("click", function () {
      panel.classList.toggle("open");
    });
    panel.querySelector("#obt-x").addEventListener("click", function () {
      panel.classList.remove("open");
    });

    // sliders
    panel.querySelectorAll("input[type=range]").forEach(function (input) {
      var row = input.closest(".row");
      var g = GROUPS.filter(function (x) {
        return x.key === row.getAttribute("data-g");
      })[0];
      var knob = g.knobs.filter(function (x) {
        return x.k === row.getAttribute("data-k");
      })[0];
      input.addEventListener("input", function () {
        var v = parseFloat(input.value);
        state[g.key][knob.k] = v;
        row.querySelector(".top span").textContent = fmt(knob, v);
        if (!targetEls(g).length) {
          say("Pick an element for “" + g.label + "” first.");
          return;
        }
        say("");
        applyGroup(g);
      });
    });

    // 0/1 and enum selects
    panel.querySelectorAll("select[data-pick]").forEach(function (sel) {
      var g = GROUPS.filter(function (x) {
        return x.key === sel.getAttribute("data-g");
      })[0];
      sel.addEventListener("change", function () {
        state[g.key][sel.getAttribute("data-pick")] = sel.value;
        applyGroup(g);
      });
    });

    // target pickers
    panel.querySelectorAll("select[data-target]").forEach(function (sel) {
      var g = GROUPS.filter(function (x) {
        return x.key === sel.getAttribute("data-target");
      })[0];
      sel.addEventListener("change", function () {
        targets[g.key] = sel.value === "all" ? "all" : cands[+sel.value] || null;
        if (sel.value === "") {
          targets[g.key] = null;
          say("Not applied — nothing to drive.");
          return;
        }
        applyGroup(g);
        say("Applied to " + targetEls(g).length + " element(s).");
      });
    });

    panel.querySelector("#obt-reset").addEventListener("click", function () {
      GROUPS.forEach(function (g) {
        (g.knobs || []).forEach(function (knob) {
          state[g.key][knob.k] = knob.d;
        });
        (g.picks || []).forEach(function (p) {
          state[g.key][p.k] = String(p.d);
        });
        applyGroup(g);
      });
      panel.querySelectorAll("input[type=range]").forEach(function (input) {
        var row = input.closest(".row");
        var g = GROUPS.filter(function (x) {
          return x.key === row.getAttribute("data-g");
        })[0];
        var knob = g.knobs.filter(function (x) {
          return x.k === row.getAttribute("data-k");
        })[0];
        input.value = state[g.key][knob.k];
        row.querySelector(".top span").textContent = fmt(knob, input.value);
      });
      say("Back to orb-motion defaults.");
    });

    // Grouped per element, defaults omitted — so what you paste is only what
    // actually differs from what the module already does.
    panel.querySelector("#obt-copy").addEventListener("click", function () {
      var byEl = [];
      GROUPS.forEach(function (g) {
        targetEls(g).forEach(function (el) {
          var entry = null;
          byEl.forEach(function (e) {
            if (e.el === el) entry = e;
          });
          if (!entry) {
            entry = { el: el, lines: [] };
            byEl.push(entry);
          }
          entry.lines.push(g.attr + " =");
          (g.knobs || []).forEach(function (knob) {
            var v = state[g.key][knob.k];
            if (fmt(knob, v) === fmt(knob, knob.d)) return; // default: skip
            entry.lines.push(attrOf(g, knob.k) + " = " + fmt(knob, v));
          });
          (g.picks || []).forEach(function (p) {
            if (String(state[g.key][p.k]) === String(p.d)) return;
            entry.lines.push(attrOf(g, p.k) + " = " + state[g.key][p.k]);
          });
        });
      });
      var text = byEl.length
        ? byEl
            .map(function (e) {
              return label(e.el) + "\n" + e.lines.join("\n");
            })
            .join("\n\n")
        : "Nothing applied yet.";
      panel.querySelector("#obt-out").value = text;
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      say("Copied — defaults omitted.");
    });

    // drag the panel by its heading
    var h3 = panel.querySelector("h3"),
      drag = null;
    h3.addEventListener("pointerdown", function (e) {
      var r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = r.left + "px";
      panel.style.top = r.top + "px";
      h3.setPointerCapture(e.pointerId);
    });
    h3.addEventListener("pointermove", function (e) {
      if (!drag) return;
      panel.style.left = e.clientX - drag.dx + "px";
      panel.style.top = e.clientY - drag.dy + "px";
    });
    h3.addEventListener("pointerup", function () {
      drag = null;
    });
  }

  function boot() {
    seedState();
    init();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
