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
       (data capture onward). Unused on the selfie page.

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
    return FC;
  };

  function maybeResetJourney(scope) {
    var root = scope || document;
    var hit =
      (root.matches && root.matches("[data-journey-start]") && root) ||
      (root.querySelector && root.querySelector("[data-journey-start]"));
    if (hit) FC.resetJourney();
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
