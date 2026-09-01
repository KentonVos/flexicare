/* ============================================================
   Flexicare Kiosk — device pairing, heartbeat, idle reset
   ------------------------------------------------------------
   Plain JS (ES5-style). Load AFTER flexicare-core.js and BEFORE the page
   controllers (it has to own the token before /onboarding creates a session).

   WHY THIS EXISTS
     The same Webflow build serves two audiences: shoppers on the public site,
     and in-store tablets in five Clicks stores. The ONLY differences are here:

       1. A tablet is PAIRED once and holds a long-lived device token.
       2. POST /sessions carries that token, which makes the session
          `channel: "KIOSK"` instead of `"WEB"`.
       3. Only a KIOSK session may spin the prize wheel (flexicare-spin.js).
       4. A tablet heartbeats so the admin sees it online, and resets itself
          to the attract screen when a shopper walks away.
       5. A tablet goes FULLSCREEN on the first tap (Chrome Android hides the
          address bar and the status bar), which is how the kiosk look is
          achieved without a PWA. See the fullscreen section below.

     A web visitor never pairs, so isKiosk() is false, authHeaders() is empty,
     no heartbeat runs, and no idle timer runs. This file is inert on the
     public site — that is the design, not an accident.

   THE TOKEN IS THE ONE LONG-LIVED CREDENTIAL IN THE WHOLE FRONTEND
     It identifies a DEVICE, not a person. It lives in localStorage (it must
     outlive sessions — the session id stays in sessionStorage so the next
     shopper never resumes the last one's run). It is never rendered, never
     logged, never put in a URL, and only ever sent as X-Kiosk-Token to
     Flexicare.config.apiBase. The server shows it EXACTLY ONCE, at pairing —
     there is no endpoint to read it back, so if the write fails the operator
     needs a fresh pairing code.

   WHICH CALLS CARRY THE HEADER (and no others)
       POST /sessions                  — binds session → kiosk → store
       POST /sessions/{id}/spin        — proves the spin is on the same tablet
       GET  /kiosks/me, POST /kiosks/heartbeat  — this file's own calls
     Everywhere else it is unnecessary. Call sites opt in explicitly with
     Flexicare.api(path, { kiosk: true }) — see flexicare-core.js.

   401 vs EVERYTHING ELSE
     A 401 means the admin revoked the token: clear it, drop the session, show
     the unpaired screen. A network error or 5xx means nothing of the sort —
     KEEP the token and the cached config, and let the next heartbeat sort it
     out. Clearing on a flaky store wifi would strand the tablet.

   NEVER fall back to a header-less POST /sessions after a 401. That would
   quietly create a WEB session on a tablet, and the shopper would finish the
   whole quiz only to be told they cannot spin.

   ------------------------------------------------------------
   WEBFLOW ATTRIBUTE CONTRACT

   All of this is OPTIONAL on the public site — none of it needs to exist on
   pages a web visitor sees. Build it on a dedicated kiosk page (e.g. /kiosk)
   or as a full-screen overlay inside the persistent shell.

     [data-kiosk-pair]         The pairing panel wrapper. Its presence is what
                               makes a page able to pair. Config attributes:
                                 data-kiosk-attract="/"     idle-reset target
                                 data-kiosk-version="1.2.0" heartbeat app_version
                                 data-kiosk-debug           console logging
     [data-kiosk-pair-input]   <input> for the XXXX-XXXX code. Formatted as the
                               operator types: upper-cased, restricted to the
                               unambiguous alphabet (no I O 0 1), dash inserted
                               after 4 characters, capped at 9.
     [data-kiosk-pair-submit]  The "Pair" button. Disabled until the code is
                               well-formed, and during the request / a 429
                               countdown.
     [data-kiosk-pair-error]   Message box. Filled with the server's `detail`
                               (or the countdown) as TEXT, never HTML.

     SLOTS (written once paired, safe on the attract screen / a small badge):
     [data-kiosk-name]         kiosk.name        ("Sandton City — entrance tablet")
     [data-kiosk-store]        kiosk.location.name ("Clicks Sandton City")

     VISIBILITY (the same mechanism flexicare-spin.js uses):
     [data-kiosk-when="unpaired disabled"]
                               Shown only while data-kiosk-state is one of the
                               listed values; display:none otherwise. Space
                               separated, any number of values.

     PER-PAGE, on anything inside data-barba="container":
     [data-kiosk-screen="quiz"]  What to report in the heartbeat's `screen`
                               field. Keep to: attract, quiz, photo, results,
                               spin, prize, unpaired, disabled. Falls back to a
                               path-derived guess, so setting it is optional.
     [data-kiosk-idle-factor="2"]
                               Multiplies idle_timeout_seconds on this page.
                               Put 2 (or more) on the PRIZE page — the shopper
                               may need time to photograph the claim code.
     [data-kiosk-fullscreen="off"]
                               Opts a PAIRED device out of the fullscreen-on-
                               tap behaviour. Read document-wide (one device,
                               one answer) and only consulted when a token
                               exists, so it does nothing on the public site.
                               Default on. See docs/kiosk-tablet-setup.md.

   STATE (drive your CSS off this — it is set on BOTH <html> and the panel):
     data-kiosk-state = "web"      no token: a normal web visitor
                      | "unpaired" a kiosk page with no token (or after a 401)
                      | "pairing"  a pair request is in flight
                      | "active"   paired and enabled — the normal state
                      | "disabled" paired, but the admin switched it off

   PUBLIC API (window.Flexicare.kiosk)
     isKiosk()      → boolean. "Is there a device token?" This is what the rest
                      of the funnel asks before offering the spin.
     authHeaders()  → { "X-Kiosk-Token": … } or {}. Used by FC.api's kiosk flag.
     info()         → { kiosk, config, status } from the cache (may be stale).
     setScreen(s)   → what the next heartbeat reports.
     pair(code)     → Promise. Also what the pairing panel calls.
     unpair()       → clears the token locally and shows the unpaired screen.
                      (Does NOT revoke server-side — that is an admin action.)
     onDisabled(fn) / onUnpaired(fn) → callbacks, if a page needs to react.
   ============================================================ */
(function () {
  "use strict";

  if (!window.Flexicare) {
    console.warn("[kiosk] flexicare-core.js must load first.");
    return;
  }
  var FC = window.Flexicare;
  var CFG = (FC.config && FC.config.kiosk) || {};
  var STORE_KEY = CFG.tokenKey || "flx_kiosk_token";

  // The pairing/claim alphabet: no I, O, 0 or 1 — these codes get read aloud
  // across a shop floor and typed on a tablet.
  var ALPHABET = /[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/;

  var K = (FC.kiosk = FC.kiosk || {});

  var state = {
    token: null,
    kiosk: null, // { id, name, status, location: { id, name, code } }
    config: null, // { heartbeat_seconds, idle_timeout_seconds }
    status: null, // "ACTIVE" | "DISABLED"
    mode: "web", // mirrors data-kiosk-state
    screen: null, // reported in the heartbeat
    panel: null, // the [data-kiosk-pair] element, when a page has one
    beatTimer: null,
    beatEvery: null, // seconds the current timer was armed with
    idleTimer: null,
    idleAt: 0, // timestamp the current idle window expires at
    cooldownTimer: null, // 429 countdown on the pairing button
    cooldownUntil: 0,
    busy: false, // a pair request is in flight
    debug: false,
  };

  var listeners = { disabled: [], unpaired: [] };

  function dbg() {
    if (window.console && (window.FLEXICARE_DEBUG || state.debug))
      console.log.apply(console, ["[kiosk]"].concat([].slice.call(arguments)));
  }

  /* ------------------------------ helpers ------------------------------ */

  function one(sel, root) {
    return (root || document).querySelector(sel);
  }
  function all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function attr(el, name, def) {
    var v = el && el.getAttribute && el.getAttribute(name);
    return v === null || v === undefined || v === "" ? def : v;
  }
  function num(el, name, def, min) {
    var n = parseFloat(attr(el, name, ""));
    if (isNaN(n)) return def;
    return min != null && n < min ? min : n;
  }
  function text(el, value) {
    if (el) el.textContent = value == null ? "" : String(value);
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
  function go(url) {
    if (!url || samePath(url)) return;
    if (window.barba && typeof window.barba.go === "function")
      window.barba.go(url);
    else window.location.href = url;
  }
  function now() {
    return new Date().getTime();
  }
  function fire(name) {
    var fns = listeners[name] || [];
    for (var i = 0; i < fns.length; i++) {
      try {
        fns[i](K.info());
      } catch (e) {}
    }
  }

  /* --------------------------- token storage ---------------------------
     One localStorage entry holds the token AND the last known kiosk/config,
     so the attract screen can render the store name before the first network
     call comes back (and still renders it when the store wifi is down).

     Storage can throw outright (Safari private mode, a locked-down tablet
     profile). We degrade to memory: the device still works for this app
     session, but a reload will need re-pairing. Nothing here may throw. */

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.token ? parsed : null;
    } catch (e) {
      return null;
    }
  }
  function writeStore() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          token: state.token,
          kiosk: state.kiosk,
          config: state.config,
        })
      );
      return true;
    } catch (e) {
      // Memory-only from here. Say so LOUDLY — an operator who does not know
      // this will be re-pairing the tablet every morning and blaming the app.
      if (window.console)
        console.warn(
          "[kiosk] localStorage is unavailable — the device token cannot be " +
            "persisted and this tablet will need re-pairing after a reload."
        );
      return false;
    }
  }
  function dropStore() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (e) {}
  }

  /* ------------------------------- state ------------------------------- */

  // "web" is the absence of kiosk mode, not a kiosk state: only a page that
  // actually offers pairing shows "unpaired". Everything else just carries on
  // as the public site, which is what a browser on the real website is.
  function computeMode() {
    if (state.busy) return "pairing"; // a pair request is in flight
    if (!state.token) return state.panel ? "unpaired" : "web";
    return state.status === "DISABLED" ? "disabled" : "active";
  }

  function applyState() {
    var mode = computeMode();
    var changed = mode !== state.mode;
    state.mode = mode;

    var root = document.documentElement;
    if (root) root.setAttribute("data-kiosk-state", mode);
    if (state.panel) state.panel.setAttribute("data-kiosk-state", mode);

    paintSlots();
    applyWhen();
    refreshPanel();

    if (changed) {
      dbg("state →", mode);
      if (mode === "disabled") fire("disabled");
      if (mode === "unpaired") fire("unpaired");
    }
  }

  // [data-kiosk-when="a b"] — shown only in the listed states.
  function applyWhen() {
    all("[data-kiosk-when]").forEach(function (el) {
      var list = (attr(el, "data-kiosk-when", "") + "").split(/\s+/);
      var on = false;
      for (var i = 0; i < list.length; i++)
        if (list[i] && list[i] === state.mode) on = true;
      el.style.display = on ? "" : "none";
    });
  }

  function paintSlots() {
    var k = state.kiosk;
    all("[data-kiosk-name]").forEach(function (el) {
      text(el, (k && k.name) || "");
    });
    all("[data-kiosk-store]").forEach(function (el) {
      text(el, (k && k.location && k.location.name) || "");
    });
  }

  /* ------------------------- applying server data -------------------------
     /pair, /me and every heartbeat all hand back the same two things. Apply
     them through here so a config change from ANY of them re-arms the timers
     — admins retune heartbeat_seconds and idle_timeout_seconds per device
     without a deploy, and it has to take effect without a reload. */

  function applyServer(payload) {
    if (!payload) return;
    if (payload.kiosk) {
      state.kiosk = payload.kiosk;
      if (payload.kiosk.status) state.status = payload.kiosk.status;
    }
    if (payload.status) state.status = payload.status; // heartbeat's own field
    if (payload.config) {
      state.config = payload.config;
      armHeartbeat(); // re-arms only if the interval actually changed
      resetIdle(); // pick up a new idle_timeout_seconds immediately
    }
    if (state.token) writeStore();
    applyState();
  }

  function heartbeatSeconds() {
    var n = state.config && state.config.heartbeat_seconds;
    return typeof n === "number" && n > 0 ? n : CFG.heartbeatSeconds || 60;
  }
  function idleSeconds() {
    var n = state.config && state.config.idle_timeout_seconds;
    return typeof n === "number" && n > 0 ? n : CFG.idleTimeoutSeconds || 90;
  }

  /* ------------------------------ public API ------------------------------ */

  K.isKiosk = function () {
    return !!state.token;
  };
  K.isPaired = K.isKiosk;

  K.authHeaders = function () {
    return state.token ? { "X-Kiosk-Token": state.token } : {};
  };

  K.info = function () {
    return {
      paired: !!state.token,
      kiosk: state.kiosk,
      config: state.config,
      status: state.status,
      mode: state.mode,
    };
  };

  K.status = function () {
    return state.status;
  };

  K.setScreen = function (name) {
    if (name) state.screen = String(name).slice(0, 40);
    return state.screen;
  };

  K.onDisabled = function (fn) {
    if (typeof fn === "function") listeners.disabled.push(fn);
  };
  K.onUnpaired = function (fn) {
    if (typeof fn === "function") listeners.unpaired.push(fn);
  };

  /* Local unpair. Drops the token, the session and the timers. Used on 401
     and by an operator-facing "unpair this device" control if you build one.
     It does NOT revoke the token server-side — an admin does that, and doing
     so is exactly what produces the 401 that lands us here. */
  K.unpair = function (reason) {
    dbg("unpairing:", reason || "manual");
    state.token = null;
    state.kiosk = null;
    state.config = null;
    state.status = null;
    dropStore();
    stopHeartbeat();
    stopIdle();
    // The shopper mid-quiz cannot finish a session bound to a revoked device.
    if (FC.getSessionId()) FC.resetJourney();
    applyState();
  };

  /* ------------------------------- pairing ------------------------------- */

  // Normalises anything an operator can plausibly type or paste into
  // XXXX-XXXX. The server upper-cases and trims too, but doing it here is what
  // lets the input format live and the button enable at the right moment.
  function normaliseCode(raw) {
    var up = (raw || "").toUpperCase();
    var kept = "";
    for (var i = 0; i < up.length && kept.length < 8; i++)
      if (ALPHABET.test(up.charAt(i))) kept += up.charAt(i);
    return kept.length > 4 ? kept.slice(0, 4) + "-" + kept.slice(4) : kept;
  }
  function codeComplete(code) {
    return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(
      code || ""
    );
  }

  K.pair = function (code) {
    code = normaliseCode(code);
    if (!codeComplete(code))
      return Promise.reject(
        new Error("Enter the 8-character code as XXXX-XXXX")
      );
    if (state.busy) return Promise.reject(new Error("Pairing already running"));

    state.busy = true;
    clearPanelError();
    applyState();

    return FC.api("/kiosks/pair", {
      method: "POST",
      body: { pairing_code: code },
    })
      .then(function (res) {
        var token = res && res.device_token;
        if (!token) throw new Error("No device token returned");
        state.busy = false;
        state.token = token; // shown exactly once — persist immediately
        state.kiosk = (res && res.kiosk) || null;
        state.config = (res && res.config) || null;
        state.status = (state.kiosk && state.kiosk.status) || "ACTIVE";
        writeStore();
        armHeartbeat();
        resetIdle();
        applyState();
        beat(); // report in straight away so the admin sees it come online
        dbg("paired:", state.kiosk && state.kiosk.name);
        return K.info();
      })
      .catch(function (err) {
        state.busy = false;
        applyState();
        showPairError(err);
        throw err;
      });
  };

  /* ------------------------- the pairing panel UI ------------------------- */

  function clearPanelError() {
    if (!state.panel) return;
    all("[data-kiosk-pair-error]", state.panel).forEach(function (el) {
      text(el, "");
      el.style.display = "none";
    });
  }

  function showPairError(err) {
    var msg;
    var status = err && err.status;
    if (status === 404)
      msg =
        (err && err.detail) ||
        "That code isn't valid any more. Ask for a new one.";
    else if (status === 422) msg = "Enter the 8-character code as XXXX-XXXX.";
    else if (status === 429) {
      startCooldown((err && err.retryAfter) || 60);
      return; // the countdown writes its own message every second
    } else if (status)
      msg = (err && err.detail) || "Pairing failed. Please try again.";
    else msg = (err && err.message) || "Pairing failed. Please try again.";
    writePairError(msg);
  }

  function writePairError(msg) {
    if (!state.panel) return;
    all("[data-kiosk-pair-error]", state.panel).forEach(function (el) {
      text(el, msg); // TEXT — server copy is never trusted as HTML
      el.style.display = msg ? "" : "none";
    });
  }

  // 429: the server tells us how many SECONDS to wait. Count it down on the
  // button rather than letting the operator keep hammering it into more 429s.
  function startCooldown(seconds) {
    state.cooldownUntil = now() + seconds * 1000;
    if (state.cooldownTimer) clearInterval(state.cooldownTimer);
    state.cooldownTimer = setInterval(tickCooldown, 1000);
    tickCooldown();
  }
  function tickCooldown() {
    var left = Math.ceil((state.cooldownUntil - now()) / 1000);
    if (left <= 0) {
      clearInterval(state.cooldownTimer);
      state.cooldownTimer = null;
      state.cooldownUntil = 0;
      writePairError("");
      refreshPanel();
      return;
    }
    writePairError("Too many attempts — try again in " + left + " seconds.");
    refreshPanel();
  }
  function cooling() {
    return state.cooldownUntil > now();
  }

  function refreshPanel() {
    if (!state.panel) return;
    var input = one("[data-kiosk-pair-input]", state.panel);
    var btn = one("[data-kiosk-pair-submit]", state.panel);
    var ready = input && codeComplete(normaliseCode(input.value));
    var blocked = state.busy || cooling();
    if (btn) {
      var off = !ready || blocked;
      btn.disabled = !!off;
      btn.setAttribute("aria-disabled", off ? "true" : "false");
      btn.setAttribute("data-kiosk-busy", state.busy ? "true" : "false");
    }
    if (input) input.disabled = !!blocked;
  }

  function submitPanel() {
    if (!state.panel || state.busy || cooling()) return;
    var input = one("[data-kiosk-pair-input]", state.panel);
    var code = normaliseCode(input && input.value);
    if (!codeComplete(code)) {
      writePairError("Enter the 8-character code as XXXX-XXXX.");
      return;
    }
    K.pair(code).catch(function () {}); // showPairError already reported it
  }

  /* --------------------- deep link:  ?pair=XXXX-XXXX ---------------------
     The admin opens the kiosk URL with the code in the query string. Submit
     it once and STRIP IT FROM THE ADDRESS BAR immediately — a pairing code is
     single-use, so a reload with the parameter still there would 404 and look
     like the pairing itself had failed. Only ever runs when unpaired. */

  function consumeDeepLink() {
    var code = null;
    try {
      code = new URL(location.href).searchParams.get("pair");
    } catch (e) {
      var m = /[?&]pair=([^&]+)/.exec(location.search || "");
      code = m ? decodeURIComponent(m[1]) : null;
    }
    if (!code) return;

    stripPairParam();
    if (state.token) {
      dbg("?pair= ignored — this device is already paired");
      return;
    }
    dbg("?pair= deep link — pairing");
    K.pair(code).catch(function () {});
  }

  function stripPairParam() {
    try {
      var url = new URL(location.href);
      if (!url.searchParams.has("pair")) return;
      url.searchParams.delete("pair");
      var qs = url.searchParams.toString();
      history.replaceState(
        history.state,
        "",
        url.pathname + (qs ? "?" + qs : "") + url.hash
      );
    } catch (e) {}
  }

  /* ------------------------------ boot check ------------------------------
     GET /kiosks/me once per full page load. Refreshes the name/store/config
     and, crucially, learns that an admin has DISABLED or revoked the device.
     A disabled kiosk still gets a 200 here — that is how it finds out. */

  function checkMe() {
    if (!state.token) return Promise.resolve();
    return FC.api("/kiosks/me", { kiosk: true })
      .then(function (res) {
        applyServer(res);
        dbg("/me ok", state.status, state.config);
      })
      .catch(function (err) {
        if (err && err.status === 401) {
          K.unpair("401 on /me");
          return;
        }
        // Network / 5xx: keep the cached values and carry on. The heartbeat
        // will pick things up. NEVER clear the token here.
        dbg("/me failed (keeping cache):", (err && err.message) || err);
      });
  }

  /* ------------------------------ heartbeat ------------------------------
     Every heartbeat_seconds, on EVERY screen, for the life of the app — the
     admin list marks a kiosk offline after ~3 missed beats, so it has to keep
     running through the quiz and the attract loop alike. It also keeps
     running while DISABLED: that is the only way the tablet learns it has
     been switched back on without someone reloading it. */

  function screenName() {
    if (state.screen) return state.screen;
    if (state.mode === "unpaired") return "unpaired";
    if (state.mode === "disabled") return "disabled";
    var p = (location.pathname || "").replace(/\/+$/, "");
    if (!p || p === "") return "attract";
    if (/onboarding/.test(p)) return "quiz";
    if (/selfie|avatar/.test(p)) return "photo";
    if (/archetype|flexicare$/.test(p)) return "quiz";
    if (/two-selves|reveal/.test(p)) return "results";
    if (/product/.test(p)) return "results";
    if (/spin/.test(p)) return "spin";
    return "attract";
  }

  function beat() {
    if (!state.token) return;
    FC.api("/kiosks/heartbeat", {
      method: "POST",
      kiosk: true,
      body: {
        app_version: String(CFG.appVersion || "1.0.0").slice(0, 40),
        screen: screenName(),
      },
    })
      .then(function (res) {
        applyServer(res);
      })
      .catch(function (err) {
        if (err && err.status === 401) {
          K.unpair("401 on heartbeat");
          return;
        }
        // Anything else: ignore and try again at the next tick.
        dbg("heartbeat failed:", (err && err.message) || err);
      });
  }

  function armHeartbeat() {
    if (!state.token) return;
    var every = heartbeatSeconds();
    if (state.beatTimer && state.beatEvery === every) return; // unchanged
    stopHeartbeat();
    state.beatEvery = every;
    state.beatTimer = setInterval(beat, every * 1000);
    dbg("heartbeat armed:", every + "s");
  }
  function stopHeartbeat() {
    if (state.beatTimer) clearInterval(state.beatTimer);
    state.beatTimer = null;
    state.beatEvery = null;
  }

  /* ----------------------------- idle reset -----------------------------
     A shopper walks away mid-quiz; the next one must not inherit their
     session. After idle_timeout_seconds without touch input we drop the
     session id (no server call — an abandoned session needs no cleanup) and
     return to the attract screen.

     [data-kiosk-idle-factor="2"] on a page multiplies the window. Put it on
     the PRIZE page: the shopper is reading a claim code off the screen or
     photographing it, and yanking that away is the one genuinely costly
     timeout in the flow. */

  function idleFactor() {
    var el = one("[data-kiosk-idle-factor]");
    return el ? num(el, "data-kiosk-idle-factor", 1, 1) : 1;
  }

  function resetIdle() {
    if (!state.token) return;
    state.idleAt = now() + idleSeconds() * idleFactor() * 1000;
    if (!state.idleTimer) state.idleTimer = setInterval(tickIdle, 1000);
  }
  function stopIdle() {
    if (state.idleTimer) clearInterval(state.idleTimer);
    state.idleTimer = null;
    state.idleAt = 0;
  }
  function tickIdle() {
    if (!state.token || !state.idleAt) return;
    if (now() < state.idleAt) return;
    var attract = attractUrl();
    if (samePath(attract)) {
      resetIdle(); // already home — just re-arm, don't thrash barba.go()
      return;
    }
    dbg("idle timeout — returning to", attract);
    FC.resetJourney();
    resetIdle();
    go(attract);
  }

  function attractUrl() {
    var el = one("[data-kiosk-attract]");
    return (
      (el && attr(el, "data-kiosk-attract", null)) || CFG.attractUrl || "/"
    );
  }

  /* ---------------------------- fullscreen ----------------------------
     Chrome on Android goes truly edge-to-edge on requestFullscreen() — no
     address bar AND no system status bar. That is the whole reason this
     exists: it gets the kiosk look with no manifest, no service worker and
     no change to how the site is hosted.

     Which matters, because the PWA route is not available to us. A web app
     manifest's start_url must be same-origin as the manifest, and a service
     worker must be same-origin as the pages it controls with no CORS escape
     hatch — so both need files at the SITE root, and Webflow has nowhere to
     put them. See docs/kiosk-tablet-setup.md.

     WHY ONE TAP IS ENOUGH FOR THE WHOLE JOURNEY
       Fullscreen is dropped on a document reload, not on a same-document
       navigation — and Barba never reloads. So one tap on the landing page
       ("Tap anywhere to begin" is already a full-bleed target) holds for the
       entire funnel, and the idle reset holds it too because that navigates
       with barba.go() rather than location.reload(). If you ever swap either
       for a hard redirect, the tablet drops out of fullscreen on every lap.

     KIOSK ONLY. A web visitor must never have their browser hijacked, so
     this is gated on the device token exactly like the heartbeat and the
     idle timer. Opt out on a paired device with data-kiosk-fullscreen="off"
     on the [data-kiosk-pair] panel (or any element — it is read
     document-wide, since the tablet is one device with one answer). */

  function fullscreenWanted() {
    if (!state.token) return false; // web visitor, or not yet paired
    var el = document.querySelector("[data-kiosk-fullscreen]");
    return !el || attr(el, "data-kiosk-fullscreen", "on") !== "off";
  }

  function isFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement
    );
  }

  /* Must be called from inside a user-gesture handler or the browser rejects
     it — hence the pointerdown listener below rather than a call on pair() or
     on arrival. The rejection is expected and routine (an unsupported
     browser, a gesture the engine did not credit), so it is swallowed rather
     than surfaced: failing to go fullscreen must never break the journey. */
  function enterFullscreen() {
    if (!fullscreenWanted() || isFullscreen()) return;
    var el = document.documentElement;
    var req =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen;
    if (!req) return;
    try {
      var r = req.call(el, { navigationUI: "hide" });
      if (r && typeof r.catch === "function")
        r.catch(function (err) {
          dbg("fullscreen refused:", (err && err.message) || err);
        });
    } catch (e) {
      dbg("fullscreen threw:", e && e.message);
    }
  }

  /* Every tap re-arms it, not just the first. A system dialog, a forced
     rotation or a stray swipe can drop the tablet out mid-shift, and the next
     shopper's first touch quietly puts it back — nobody has to notice. It is
     a no-op when already fullscreen. */
  document.addEventListener(
    "pointerdown",
    function () {
      enterFullscreen();
    },
    { passive: true, capture: true }
  );

  K.fullscreen = function () {
    return {
      active: isFullscreen(),
      wanted: fullscreenWanted(),
      supported: !!(
        document.documentElement.requestFullscreen ||
        document.documentElement.webkitRequestFullscreen ||
        document.documentElement.mozRequestFullScreen
      ),
    };
  };
  // Manual exit, for an operator who needs the browser back without unpinning.
  K.exitFullscreen = function () {
    var fn =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.mozCancelFullScreen;
    if (fn && isFullscreen()) fn.call(document);
  };

  var IDLE_EVENTS = [
    "pointerdown",
    "keydown",
    "touchstart",
    "wheel",
    "mousemove",
  ];
  for (var ei = 0; ei < IDLE_EVENTS.length; ei++) {
    document.addEventListener(
      IDLE_EVENTS[ei],
      function () {
        if (state.token) resetIdle();
      },
      { passive: true }
    );
  }

  /* ------------------------ delegated panel listeners ------------------------
     One listener per event on `document`, targets re-resolved at event time —
     the same model every other controller uses, and the reason the panel
     survives glass rebuilds and Barba swaps without re-binding. */

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function" || !state.panel) return;
    var btn = t.closest("[data-kiosk-pair-submit]");
    if (btn && state.panel.contains(btn)) {
      e.preventDefault();
      submitPanel();
    }
  });

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function" || !state.panel) return;
    var input = t.closest("[data-kiosk-pair-input]");
    if (!input || !state.panel.contains(input)) return;
    var formatted = normaliseCode(input.value);
    if (input.value !== formatted) input.value = formatted;
    clearPanelError();
    refreshPanel();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !state.panel) return;
    var t = e.target;
    if (!t || typeof t.closest !== "function") return;
    var input = t.closest("[data-kiosk-pair-input]");
    if (!input || !state.panel.contains(input)) return;
    e.preventDefault();
    submitPanel();
  });

  /* ---------------------------- init / lifecycle ---------------------------- */

  // Re-resolve the panel on every arrival — a Barba swap replaces the node.
  // Scoped to the incoming container: during a swap BOTH are in the DOM, and
  // a document-wide lookup can bind to the one we are leaving.
  function resolvePanel(scope) {
    scope = scope || document;
    if (scope.matches && scope.matches("[data-kiosk-pair]")) return scope;
    var found = scope.querySelector && scope.querySelector("[data-kiosk-pair]");
    if (found) return found;
    // Unlike the page controllers there IS a legitimate document-wide case
    // here: the pairing overlay may live in the persistent shell rather than
    // inside the container, in which case a swap never replaces it at all.
    if (scope !== document) {
      var shell = document.querySelector("[data-kiosk-pair]");
      if (shell && !(scope.contains && scope.contains(shell))) return shell;
    }
    return null;
  }

  function init(scope) {
    state.panel = resolvePanel(scope);
    if (state.panel) {
      state.debug = state.panel.hasAttribute("data-kiosk-debug");
      var v = attr(state.panel, "data-kiosk-version", null);
      if (v) CFG.appVersion = v;
      var a = attr(state.panel, "data-kiosk-attract", null);
      if (a) CFG.attractUrl = a;
    }
    // Per-page heartbeat screen + idle factor, read from the incoming page.
    var screenEl = null;
    if (scope && scope.matches && scope.matches("[data-kiosk-screen]"))
      screenEl = scope;
    else if (scope && scope.querySelector)
      screenEl = scope.querySelector("[data-kiosk-screen]");
    state.screen = screenEl ? attr(screenEl, "data-kiosk-screen", null) : null;

    /* Whatever copy the Designer left in the error box is NOT a fallback the
       way [data-spin-error] is — this box only ever holds a server message.
       Nothing else clears it before the first failed attempt, so an authored
       placeholder (Webflow's default "This is some text inside of a div
       block.") would sit on the unpaired screen looking like a real error. */
    clearPanelError();

    applyState();
    resetIdle();
  }

  if (window.barba && window.barba.hooks) {
    window.barba.hooks.afterEnter(function (data) {
      init((data && data.next && data.next.container) || document);
    });
  }
  window.addEventListener("pagehide", function () {
    stopHeartbeat();
    stopIdle();
  });

  /* -------------------------------- boot -------------------------------- */

  (function boot() {
    var saved = readStore();
    if (saved) {
      state.token = saved.token;
      state.kiosk = saved.kiosk || null;
      state.config = saved.config || null;
      state.status = (saved.kiosk && saved.kiosk.status) || "ACTIVE";
    }

    function start() {
      init(document);
      consumeDeepLink(); // may pair us right now
      if (state.token) {
        armHeartbeat();
        beat(); // report in immediately, don't wait a full interval
        checkMe();
      }
      dbg("boot", { paired: !!state.token, mode: state.mode });
    }

    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", start);
    else start();
  })();
})();
