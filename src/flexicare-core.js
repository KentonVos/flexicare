/* ============================================================
   Flexicare Core — persistent quiz controller foundation
   ------------------------------------------------------------
   Plain JS (ES5-style, matches the other site scripts). Load this
   FIRST of the Flexicare scripts, AFTER @barba/core and gsap.

   This is the "brain" that survives Barba container swaps (module
   scope persists — Barba does not reload the page). Each Webflow
   page is a view; this holds the state that spans them.

   Owns, so far:
     • config (API base URL, language)
     • layout mode (desktop / tablet / mobile) — see FC.isTablet()
     • the session id  (sessionStorage — the ONLY thing we must
       persist locally; treated as a secret, never logged)
     • the user's first name (FC.firstName — set by onboarding, used by
       later pages to personalise copy; recoverable from GET /sessions/{id})
     • the buffered selfie Blob  (IN MEMORY — survives Barba swaps,
       intentionally NOT survives a hard reload; downscaled by the
       selfie page before it lands here so size is never a concern)
     • the buffered avatar choice (IN MEMORY too — the alternative to
       the selfie, for users who don't want to be photographed).
       Selfie and avatar are MUTUALLY EXCLUSIVE: setting either one
       clears the other, so whichever the user did LAST is what
       /onboarding sends.
     • Flexicare.api()  — a thin fetch wrapper used by later pages
       (data capture onward). Unused on the selfie page. Pass
       `{ kiosk: true }` to attach the X-Kiosk-Token header when the
       device is paired (see flexicare-kiosk.js) — only POST /sessions
       and POST /sessions/{id}/spin do.
     • config.kiosk — fallback kiosk settings; the server's per-device
       config overrides them once paired.

   Later pages extend this same object (answers, archetype, echo
   label, etc.). Keep additions on window.Flexicare.
   ============================================================ */
(function () {
  "use strict";

  var FC = (window.Flexicare = window.Flexicare || {});

  /* ----------------------------- config ----------------------------- */
  FC.config = FC.config || {
    // Staging. Swap to the production base before go-live.
    apiBase: "https://api-staging-discovery.injozitech.com/api/v1",
    language: "en", // only `en` is fully populated server-side
    selfie: {
      maxSize: 1080, // px, long edge of the square capture
      quality: 0.8, // JPEG quality
      mirrorPreview: true, // preview looks like a mirror (natural for selfies)
      captureMirrored: false, // saved image is un-mirrored (true orientation)
      facingMode: "user", // front camera
    },
    /* Kiosk mode (flexicare-kiosk.js). Only meaningful on the in-store
       tablets — a web visitor never pairs, so none of this is ever read.
       Every value here is a FALLBACK: once the device is paired the server's
       `config` (from /kiosks/pair, /kiosks/me and every heartbeat) wins, so
       admins can retune a device without a deploy. */
    kiosk: {
      tokenKey: "flx_kiosk_token", // localStorage key (device token + cache)
      attractUrl: "/", // where an idle timeout returns to
      pairUrl: "/kiosk", // where the pairing gate sends an unpaired device
      heartbeatSeconds: 60, // until the server says otherwise
      idleTimeoutSeconds: 90, // ditto
      appVersion: "1.0.0", // stamped into every heartbeat, shown to admins
    },
  };

  /* --------------------------- layout mode --------------------------- */
  /* Set by the head snippet (Site Settings → Custom Code → Head) before
       first paint, and mirrored here so page controllers never have to read
       window.innerWidth. Survives Barba swaps like everything else on FC.
  
       Use this instead of width checks:
           if (Flexicare.isTablet()) { ... }        // NOT innerWidth <= 991
  
       The detection below is only a fallback for when the head snippet is
       missing — it keeps isTablet() honest, but it CANNOT force the viewport
       (that has to happen in the head, before paint). If layout.forced is
       false on a big iPad, the head snippet isn't installed. */
  function detectTabletFallback() {
    var ua = navigator.userAgent || "";
    var touchPoints = navigator.maxTouchPoints || 0;
    if (/iPad/.test(ua)) return true;
    if (/Macintosh/.test(ua) && touchPoints > 1) return true;
    if (/Android/.test(ua) && !/Mobile/.test(ua)) return true;
    if (/Silk|Kindle|PlayBook|Tablet/i.test(ua)) return true;
    return false;
  }

  FC.layout =
    window.__fcLayout ||
    (function () {
      var t = detectTabletFallback();
      return {
        isTablet: t,
        mode: t ? "tablet" : window.innerWidth <= 767 ? "mobile" : "desktop",
        forced: false, // head snippet absent → viewport was not pinned
        naturalWidth: window.innerWidth,
      };
    })();

  FC.isTablet = function () {
    return !!FC.layout.isTablet;
  };
  FC.isMobile = function () {
    return FC.layout.mode === "mobile";
  };
  FC.isDesktop = function () {
    return FC.layout.mode === "desktop";
  };

  /* -------------------- session id (secret, sessionStorage) -------------------- */
  var SID_KEY = "flexicare.sid";
  FC._sid = FC._sid || null;

  FC.getSessionId = function () {
    try {
      return sessionStorage.getItem(SID_KEY) || FC._sid || null;
    } catch (e) {
      return FC._sid || null; // private mode / storage blocked → memory only
    }
  };
  FC.setSessionId = function (id) {
    FC._sid = id || null;
    try {
      if (id) sessionStorage.setItem(SID_KEY, id);
    } catch (e) {}
    return FC._sid;
  };
  FC.clearSession = function () {
    FC._sid = null;
    try {
      sessionStorage.removeItem(SID_KEY);
    } catch (e) {}
  };

  /* ------------------------- first name ------------------------- */
  /* Set by the onboarding page from the form (and/or the session response).
       Later pages personalise copy with it ("Meet your two selves, Lerato").
       In memory only — a hard reload recovers it from GET /sessions/{id}
       (`first_name`), which is why the reveal page re-reads the session. */
  FC.firstName = FC.firstName || null;

  FC.setFirstName = function (name) {
    name = (name || "").trim();
    FC.firstName = name || null;
    return FC.firstName;
  };

  /* ---------------- buffered selfie (in-memory Blob) ---------------- */
  // Shape: { blob, type, width, height } or null.
  FC.photo = FC.photo || null;

  FC.setPhoto = function (blob, type, width, height) {
    FC.photo = {
      blob: blob,
      type: type || (blob && blob.type) || "image/jpeg",
      width: width || null,
      height: height || null,
    };
    FC.avatar = null; // a selfie supersedes a picked avatar
    return FC.photo;
  };
  FC.getPhoto = function () {
    return FC.photo;
  };
  FC.hasPhoto = function () {
    return !!(FC.photo && FC.photo.blob);
  };
  FC.clearPhoto = function () {
    FC.photo = null;
  };
  // Fresh object URL for showing the buffered selfie (caller revokes it).
  FC.photoObjectURL = function () {
    return FC.hasPhoto() ? URL.createObjectURL(FC.photo.blob) : null;
  };

  /* ------------- buffered avatar choice (in-memory, no blob) -------------
     The avatar path's equivalent of FC.photo. Shape:
       { id, slug, url, race, gender, ageGroup, variant }  or null.

     Only `id` is durable — the `url` from GET /avatars is presigned and
     expires in ~10 minutes, so it is for immediate display only; the picker
     re-fetches the catalog rather than reusing a stored url.

     Buffered (not sent) because PATCH /sessions/{id}/photo/avatar needs a
     session id, and the session isn't created until /onboarding submits —
     exactly like the selfie, which is buffered until it can be uploaded.

     FC.avatarGender is kept separately so it survives clearAvatar() and can
     still pre-fill /onboarding's gender pills. */
  FC.avatar = FC.avatar || null;
  FC.avatarGender = FC.avatarGender || null;

  FC.setAvatar = function (choice) {
    if (!choice || !choice.id) return null;
    FC.avatar = {
      id: choice.id,
      slug: choice.slug || null,
      url: choice.url || null,
      race: choice.race || null,
      gender: choice.gender || null,
      ageGroup: choice.ageGroup || null,
      variant: choice.variant || null,
    };
    if (choice.gender) FC.avatarGender = choice.gender;
    FC.clearPhoto(); // an avatar supersedes a captured selfie
    return FC.avatar;
  };
  FC.getAvatar = function () {
    return FC.avatar;
  };
  FC.hasAvatar = function () {
    return !!(FC.avatar && FC.avatar.id);
  };
  FC.clearAvatar = function () {
    FC.avatar = null;
  };

  /* ------------------------- API fetch helper ------------------------- */
  /* Usage (later pages):
             Flexicare.api("/sessions", { method: "POST", body: { language: "en" } })
               .then(function (session) { ... })
               .catch(function (err) { err.status, err.detail });
           Errors throw with .status and .detail (the backend's { detail } message).  */
  FC.api = function (path, opts) {
    opts = opts || {};
    var init = { method: opts.method || "GET", headers: {} };
    if (opts.body !== undefined && opts.body !== null) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    /* opts.kiosk === true  →  attach X-Kiosk-Token if this device is paired.
       Opt-IN per call on purpose: the header belongs on exactly two funnel
       calls (POST /sessions and POST /sessions/{id}/spin) plus the kiosk's own
       /kiosks/* calls, so the call sites that need it say so out loud. On an
       unpaired device (every web visitor) authHeaders() returns {} and the
       request goes out bare — which is exactly right: it becomes a WEB
       session. See docs/kiosk-and-spin.md. */
    if (opts.kiosk && FC.kiosk && typeof FC.kiosk.authHeaders === "function") {
      var kh = FC.kiosk.authHeaders();
      for (var hk in kh)
        if (kh.hasOwnProperty(hk)) init.headers[hk] = kh[hk];
    }
    if (opts.headers) {
      for (var k in opts.headers)
        if (opts.headers.hasOwnProperty(k)) init.headers[k] = opts.headers[k];
    }
    return fetch(FC.config.apiBase + path, init).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = text;
          }
        }
        if (!res.ok) {
          var msg = (data && data.detail) || "HTTP " + res.status;
          var err = new Error(msg);
          err.status = res.status;
          err.detail = data && data.detail;
          err.data = data;
          /* Retry-After (SECONDS) accompanies every 429 — pairing and the
             prize spin are both rate-limited, and both are told to show a
             live countdown rather than let the user hammer the button. */
          err.retryAfter = null;
          try {
            var ra = parseInt(res.headers.get("Retry-After"), 10);
            if (!isNaN(ra) && ra >= 0) err.retryAfter = ra;
          } catch (e2) {}
          throw err;
        }
        return data;
      });
    });
  };

  /* -------------------- journey reset (fresh start) -------------------- */
  /* A "journey" = one session. All per-journey state lives on this object and
         survives Barba swaps (that's what makes resume work) — so it needs an
         explicit reset boundary, or a second run inherits the first run's answers.
    
         resetJourney() wipes everything captured during a run: session id, buffered
         selfie, answers, archetype, echo, result. The static quiz content
         (quizData) and the layout mode are intentionally kept — neither changes
         between journeys.
    
         It fires automatically when the user enters a page tagged
         [data-journey-start] (put that on the LANDING page — it's the entry point,
         before any selfie/answers are captured). Fires on first load and on every
         Barba navigation into that page, so "start over" is always fresh without a
         hard reload. You can also call Flexicare.resetJourney() manually. */
  /* Two things this must NOT clear, both deliberate:

       • the KIOSK DEVICE TOKEN (localStorage flx_kiosk_token). It is a device
         credential, not journey data — a tablet stays paired across hundreds
         of shoppers, and wiping it here would strand it on the unpaired
         screen mid-shift with no way back but an admin pairing code.
       • the DEMO FLAG (sessionStorage fcSpinDemo). ?demo is armed once and is
         meant to survive the whole journey — including arriving back at the
         landing page to start another lap, which is exactly when this runs.

     Which is why the sessionStorage sweep below is prefix-scoped and never a
     sessionStorage.clear(). */
  FC.resetJourney = function () {
    FC.clearSession();
    FC.clearPhoto();
    FC.clearAvatar();
    FC.avatarGender = null;
    FC.firstName = null;
    FC.answers = null;
    FC._synced = null;
    FC.archetype = null;
    FC.archetypeLabel = null;
    FC.echo = null;
    FC.result = null;
    FC.images = null;
    FC.award = null; // the prize spin's result (flexicare-spin.js)
    FC.lead = null; // the spin page's lead form (flexicare-spin.js)
    FC.contact = null; // whatsapp + consent (flexicare-onboarding.js)

    /* The spin page remembers "this session already did the lead form" under
       flx_spin_lead_<session id>. Keyed by session, so a stale one can never
       gate the wrong journey — but on a kiosk running hundreds of sessions a
       day they accumulate forever, so drop them here. Prefix-scoped on
       purpose: see the note above. */
    try {
      var kill = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf("flx_spin_lead_") === 0) kill.push(k);
      }
      for (var j = 0; j < kill.length; j++) sessionStorage.removeItem(kill[j]);
    } catch (e) {}

    return FC;
  };

  function maybeResetJourney(scope) {
    var root = scope || document;
    var hit =
      (root.matches && root.matches("[data-journey-start]") && root) ||
      (root.querySelector && root.querySelector("[data-journey-start]"));
    if (hit) {
      FC.resetJourney();
      return;
    }

    /* NOT FOUND — and there is one way for that to be a mistake rather than
       "this isn't the landing page", so say so out loud.

       On a Barba navigation `scope` is the INCOMING CONTAINER. Barba swaps
       only the container, so an attribute parked on <body> or anywhere else in
       the persistent shell is an ANCESTOR of that scope and can never be
       found from it. The result is the worst kind of bug: a hard load of the
       landing page resets correctly (scope is `document`, which does contain
       the body), while arriving through the funnel silently does not — so the
       "start over" path is the one path that keeps the old journey's data.

       That is not hypothetical: data-journey-start sat on <body> until
       2026-08-31. Checking the document here instead would be far worse — the
       body is whatever the FIRST page shipped, so after a hard load of the
       landing page it keeps the attribute for the rest of the tab and EVERY
       navigation would wipe the journey mid-run. The attribute has to move
       inside the container; this warning is here to make that obvious the
       next time it happens. */
    if (scope && scope !== document && document.querySelector) {
      var stranded = document.querySelector("[data-journey-start]");
      if (stranded && !scope.contains(stranded) && window.console)
        console.warn(
          "[core] [data-journey-start] is on <" +
            stranded.tagName.toLowerCase() +
            ">, which is OUTSIDE data-barba=\"container\" — so the journey " +
            "reset fires on a hard load but NOT when the user navigates here. " +
            "Move the attribute onto an element inside the container."
        );
    }
  }

  // Registered before the page controllers' hooks (core loads first), so the
  // reset lands ahead of any quiz init on the same navigation.
  if (window.barba && window.barba.hooks) {
    window.barba.hooks.afterEnter(function (data) {
      maybeResetJourney((data && data.next && data.next.container) || document);
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () {
      maybeResetJourney(document);
    });
  else maybeResetJourney(document);
})();
