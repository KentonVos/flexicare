/* ============================================================
   Flexicare Onboarding v1 — the "Where should we send your result?"
   data-capture page  (/onboarding)
   ------------------------------------------------------------
   Plain JS (ES5-style). Load AFTER flexicare-core.js and @barba/core
   (order relative to flexicare-selfie.js doesn't matter — both only
   depend on the core).

   WHAT THIS PAGE DOES
     Collects first name, WhatsApp number, gender (required), and the
     T&Cs consent, then on submit:
       1. Creates the session   POST /sessions  { language, first_name, gender }
          → stores the id via Flexicare.setSessionId (secret, sessionStorage)
          and the first name via Flexicare.setFirstName (used by later pages).
       2. Sends whichever "photo" the user chose — the two paths are
          mutually exclusive and both kick off the same background
          with/without-cover image generation:
            • SELFIE  — buffered Blob: presign → PUT to storage → confirm.
              Runs in the SAME interaction (presigned URL expires in 10 min).
            • AVATAR  — buffered choice: PATCH …/photo/avatar { avatar_id }.
              Generates nothing: the avatar's approved with/without-cover
              pair is pre-stored and is just copied onto the session, so
              /images is READY on the reveal page's first poll (§3.8).
              (The avatar page can't send it itself — that endpoint needs a
              session id and the session is created HERE.)
          Failure of either does NOT block navigation — the images poll later
          and show a graceful fallback. Only a failed SESSION CREATE blocks.
       3. Sends the WhatsApp number: PATCH …/contact/phone { phone_number }.
          Also non-blocking, and also fine on an IN_PROGRESS session (that
          endpoint only rejects ABANDONED ones). Number + consent are still
          mirrored onto Flexicare.contact for any later CRM wiring.
       4. Navigates to /archetype via barba.go() (never a reload — a reload
          before the upload finishes would drop the in-memory selfie/avatar).

   Both the selfie path and the avatar path funnel through this page, so
   gender is captured here for BOTH routes. If the user came via the avatar
   picker they already chose a gender there, so the pills are PRE-FILLED from
   Flexicare.avatarGender — still editable, and this page stays the authority
   for the session's `gender`.

   CONVENTIONS (mirrors flexicare-selfie.js — read that file's notes too)
     • Inits on Barba `afterEnter` (after transition.js's syncRegions()
       + LiquidGlass.scan() have settled the nav buttons / glass).
     • ONE delegated listener each for click / input / change / submit on
       `document`, re-resolving targets by attribute at event time — immune
       to node rebuilds (glass) and hook timing. Nothing that can go stale
       is stored; buttons are re-queried by attribute every time.
     • Navigates with barba.go(); `data-onboarding-next` beats href, and a
       Webflow placeholder href="#" is ignored.
     • The submit + back buttons live in the PERSISTENT nav bar (outside the
       Barba container, synced per page). Because clicks are delegated, it
       doesn't matter that they live outside the form.

   ------------------------------------------------------------
   WEBFLOW ATTRIBUTE CONTRACT
     [data-onboarding-form]     REQUIRED. Put on the Form Block (the <form>).
                                Its presence = "this is the onboarding page"
                                (gates init) and lets us catch the native
                                Enter-key submit and stop Webflow reloading.
     [data-onboarding-name]     REQUIRED. The first-name <input> ITSELF
                                (attribute goes on the input, not a wrapper).
     [data-onboarding-whatsapp] REQUIRED. The WhatsApp-number <input> itself.
     [data-onboarding-error]    Optional. The "Valid South African mobile
                                number required." message. Hidden by the
                                script until the number is non-empty & invalid.
     [data-onboarding-gender]   Optional wrapper (nice for grouping).
     [data-gender="male"] /
     [data-gender="female"]     REQUIRED. The two clickable gender options —
                                plain WEBFLOW DIVS work great here. The selected
                                one gets a class toggled on it + aria-pressed.
                                The class defaults to `is-selected`; override it
                                per element with:
                                  data-selected-class="YourComboClass"
                                so you can point it at whatever Webflow combo
                                class you styled. Only one is selected at a time.
     [data-onboarding-consent]  REQUIRED. The T&Cs checkbox — a plain WEBFLOW DIV
                                (put this attribute on the whole clickable row).
                                Toggles a class on it + aria-checked. Class
                                defaults to `is-checked`; override with:
                                  data-checked-class="YourComboClass".
                                To keep the whole row clickable but put the class
                                on an INNER element (e.g. the styled box), add:
                                  data-checked-target="<css selector>"
                                  e.g. data-checked-target=".fc-consent"
                                (A native <input type="checkbox"> also works if
                                you ever want one — the script syncs its checked
                                state — but a div is the intended path here.)
     [data-onboarding-submit]   REQUIRED. The "See my two selves →" button.
                                Gets class `is-disabled` + aria-disabled while
                                the form is invalid (style `.is-disabled`; a
                                dimmed default is applied inline too). It stays
                                clickable — tapping it while invalid surfaces
                                the errors instead of navigating.
     [data-onboarding-back]     Optional. The "Back" button. Empty attribute
                                (or href) → history.back(); give it a URL value
                                to force a destination.
   Attributes read for values:
     data-onboarding-next        submit btn or form; next URL (default "/archetype")
     data-onboarding-back        back btn; URL to force (else history.back())
     data-onboarding-busy-label  submit btn; label while submitting (default "Sending…")
     [data-onboarding-label]     optional inner text node of the submit button
                                 (safer label-swap target when it has nested markup)
     [data-onboarding-form-error] optional element for API/session errors

   NON-NATIVE FORM + GLASS FIELDS
     • [data-onboarding-form] may sit on a plain <div> (e.g. an Embed wrapper) —
       it needn't be a <form>. The script reads inputs by attribute, not via a
       form, so a div-based/embedded form works identically.
     • Glass CANNOT go on an <input> (glass.js inserts an overlay child, and
       inputs can't hold children). Put data-liquid-glass on the field WRAPPER
       and data-onboarding-name/-whatsapp on the <input> inside it (transparent
       background so the glass shows). Use data-lg-press="0"
       (or data-lg-preset="nav") on fields so tapping to focus doesn't spring.
     • Gender pills / consent box / submit / back are divs or links — glass goes
       directly on them; press is fine there. On glass buttons use
       data-anim-fade (NOT data-anim) — glass owns transform.

   PROGRESS BAR (owned by transition.js, not this script): set
     data-progress="0.2"  on the /onboarding Barba container.
   HEADLINE reveal (optional, existing vocabulary): tag it
     data-text-reveal data-anim="1".
   ============================================================ */
(function () {
  "use strict";

  if (!window.Flexicare) {
    console.warn("[onboarding] flexicare-core.js must load first.");
    return;
  }
  var FC = window.Flexicare;

  var state = {
    form: null,
    gender: null, // "male" | "female" | null
    consent: false,
    busy: false,
  };

  /* ----------------------------- dom helpers ----------------------------- */

  function q(sel) {
    return document.querySelector(sel);
  }
  function qa(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }
  function findIn(scope, sel) {
    return (scope || document).querySelector(sel);
  }
  function val(sel) {
    var el = q(sel);
    return el && typeof el.value === "string" ? el.value : "";
  }
  function realHref(el) {
    // Webflow gives Link Blocks a default href="#"; treat that (and empty) as
    // "no link", not a destination.
    var h = el && el.getAttribute && el.getAttribute("href");
    return h && h !== "#" ? h : null;
  }

  /* ------------------------- ZA mobile validation ------------------------- */
  // Accepts 0XX XXX XXXX, +27…, or 27…; returns E.164 (+27…) or null.
  // Mobile national format required: 0[6-8] followed by 8 digits.
  function normalizeZaMobile(raw) {
    if (!raw) return null;
    var d = String(raw).replace(/\D/g, ""); // digits only
    var national;
    if (d.length === 11 && d.slice(0, 2) === "27") national = "0" + d.slice(2);
    else if (d.length === 10 && d.charAt(0) === "0") national = d;
    else if (d.length === 9 && /^[6-8]/.test(d))
      national = "0" + d; // missing leading 0
    else return null;
    if (!/^0[6-8]\d{8}$/.test(national)) return null;
    return "+27" + national.slice(1);
  }

  /* ------------------------------- read/validate ------------------------------- */

  function readForm() {
    var waRaw = (val("[data-onboarding-whatsapp]") || "").trim();
    return {
      name: (val("[data-onboarding-name]") || "").trim(),
      whatsappRaw: waRaw,
      whatsapp: normalizeZaMobile(waRaw),
      gender: state.gender,
      consent: !!state.consent,
    };
  }
  function isValid(f) {
    return !!(f.name && f.gender && f.whatsapp && f.consent);
  }

  /* --------------------------- UI reflection --------------------------- */

  function reflectGender() {
    qa("[data-gender]").forEach(function (el) {
      var on = el.getAttribute("data-gender") === state.gender;
      var cls = el.getAttribute("data-selected-class") || "is-selected";
      if (el.classList) el.classList.toggle(cls, on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  function reflectConsent() {
    qa("[data-onboarding-consent]").forEach(function (el) {
      var cls = el.getAttribute("data-checked-class") || "is-checked";
      // By default the class goes on the element carrying the attribute; set
      // data-checked-target="<selector>" to put it on a descendant instead
      // (e.g. the styled box inside a fully-clickable row).
      var sel = el.getAttribute("data-checked-target");
      var target = (sel && el.querySelector(sel)) || el;
      if (target.classList) target.classList.toggle(cls, state.consent);
      el.setAttribute("aria-checked", state.consent ? "true" : "false");
      var cb =
        el.matches && el.matches("input[type=checkbox]")
          ? el
          : el.querySelector && el.querySelector("input[type=checkbox]");
      if (cb) cb.checked = state.consent;
    });
  }
  function showNumberError(show) {
    var el = q("[data-onboarding-error]");
    if (el) el.style.display = show ? "" : "none";
  }
  function setSubmitEnabled(on) {
    var btn = q("[data-onboarding-submit]");
    if (!btn) return;
    if (btn.classList) btn.classList.toggle("is-disabled", !on);
    if (on) btn.removeAttribute("aria-disabled");
    else btn.setAttribute("aria-disabled", "true");
    // sensible dimmed default (opacity is transform-safe re: glass); override
    // via the .is-disabled class if you want a different look.
    btn.style.opacity = on ? "" : "0.45";
  }
  function showFormError(msg) {
    var el = q("[data-onboarding-form-error]");
    if (el) {
      el.textContent = msg;
      el.style.display = "";
    } else if (window.console) {
      console.warn("[onboarding] " + msg);
    }
  }
  function clearFormError() {
    var el = q("[data-onboarding-form-error]");
    if (el) el.style.display = "none";
  }

  function refresh() {
    var f = readForm();
    // number error only once they've typed something invalid
    showNumberError(!!f.whatsappRaw && !f.whatsapp);
    setSubmitEnabled(isValid(f));
  }

  /* ----------------------------- submit label ----------------------------- */

  function submitLabelTarget() {
    var btn = q("[data-onboarding-submit]");
    if (!btn) return null;
    return btn.querySelector("[data-onboarding-label]") || btn;
  }
  function setBusy(on) {
    state.busy = on;
    var btn = q("[data-onboarding-submit]");
    if (!btn) return;
    if (btn.classList) btn.classList.toggle("is-busy", on);
    if (on) btn.setAttribute("aria-busy", "true");
    else btn.removeAttribute("aria-busy");
    var t = submitLabelTarget();
    if (t) {
      if (on) {
        if (t.__obLabel == null) t.__obLabel = t.textContent;
        t.textContent =
          btn.getAttribute("data-onboarding-busy-label") || "Sending…";
      } else if (t.__obLabel != null) {
        t.textContent = t.__obLabel;
        t.__obLabel = null;
      }
    }
  }

  /* ------------------------------- backend ------------------------------- */

  function ensureSession(f) {
    var existing = FC.getSessionId();
    if (existing) return Promise.resolve(existing); // reuse — no update endpoint
    /* kiosk: true attaches X-Kiosk-Token when this device is PAIRED (see
       flexicare-kiosk.js). It is what makes the session `channel: "KIOSK"`,
       and that is the only way it can ever spin the prize wheel — so this
       header has to go on HERE, at session creation, not on the spin page.
       On the public site the device is unpaired, the header is omitted, and
       the session is a normal WEB one. */
    return FC.api("/sessions", {
      method: "POST",
      kiosk: true,
      body: {
        language: FC.config.language || "en",
        first_name: f.name,
        gender: f.gender,
      },
    }).then(function (session) {
      var id = session && session.id;
      if (!id) throw new Error("No session id returned");
      FC.setSessionId(id);
      // Later pages ("Meet your two selves, <name>") need this; the API has it
      // too, so a hard reload can recover it from GET /sessions/{id}.
      FC.setFirstName((session && session.first_name) || f.name);
      return id;
    });
  }

  // presign → PUT → confirm. Never blocks navigation on failure.
  function maybeUploadPhoto() {
    if (!FC.hasPhoto()) return Promise.resolve();
    var id = FC.getSessionId();
    var photo = FC.getPhoto();
    var ct = (photo && photo.type) || "image/jpeg";
    return FC.api("/sessions/" + id + "/photo/presign", {
      method: "POST",
      body: { content_type: ct },
    })
      .then(function (res) {
        var url = res && res.upload_url;
        var key = res && res.object_key;
        if (!url || !key) throw new Error("presign incomplete");
        return fetch(url, {
          method: "PUT",
          headers: { "Content-Type": ct },
          body: photo.blob,
        }).then(function (put) {
          if (!put.ok) throw new Error("upload PUT failed " + put.status);
          return FC.api("/sessions/" + id + "/photo/confirm", {
            method: "PATCH",
            body: { object_key: key },
          });
        });
      })
      .then(function () {
        FC.clearPhoto(); // uploaded + confirmed; free the buffer
      })
      .catch(function (err) {
        // Optional experience — do not block the flow. Leave the photo buffered
        // so a later retry is still possible if you add one.
        if (window.console)
          console.warn(
            "[onboarding] photo upload failed (continuing):",
            (err && err.message) || err
          );
      });
  }

  // The avatar path's equivalent: one PATCH, no upload. Same non-blocking
  // contract as the selfie — a failure here just means the reveal page falls
  // through to its images fallback.
  function maybeSelectAvatar() {
    if (!FC.hasAvatar()) return Promise.resolve();
    var id = FC.getSessionId();
    var avatar = FC.getAvatar();
    return FC.api("/sessions/" + id + "/photo/avatar", {
      method: "PATCH",
      body: { avatar_id: avatar.id },
    })
      .then(function () {
        // Keep the choice buffered — it's tiny, and it lets the picker restore
        // the selection if the user navigates back to it.
      })
      .catch(function (err) {
        if (window.console)
          console.warn(
            "[onboarding] avatar select failed (continuing):",
            (err && err.message) || err
          );
      });
  }

  // Selfie OR avatar — never both (the core keeps them mutually exclusive).
  function maybeSendPhoto() {
    return FC.hasPhoto() ? maybeUploadPhoto() : maybeSelectAvatar();
  }

  // PATCH …/contact/phone with the E.164 number. Non-blocking: the session is
  // already created and the quiz can proceed without it. The endpoint accepts
  // IN_PROGRESS sessions (it only rejects ABANDONED ones), so this doesn't have
  // to wait for the results screen.
  function maybeSendPhone(f) {
    if (!f.whatsapp) return Promise.resolve();
    return FC.api("/sessions/" + FC.getSessionId() + "/contact/phone", {
      method: "PATCH",
      body: { phone_number: f.whatsapp },
    }).catch(function (err) {
      if (window.console)
        console.warn(
          "[onboarding] phone save failed (continuing):",
          (err && (err.detail || err.message)) || err
        );
    });
  }

  /* ------------------------------ navigation ------------------------------ */

  function nextUrl() {
    var btn = q("[data-onboarding-submit]");
    var form = q("[data-onboarding-form]");
    return (
      (btn && (btn.getAttribute("data-onboarding-next") || realHref(btn))) ||
      (form && form.getAttribute("data-onboarding-next")) ||
      "/archetype"
    );
  }
  function go(url) {
    if (!url) return;
    if (window.barba && typeof window.barba.go === "function")
      window.barba.go(url);
    else window.location.href = url; // fallback: reload (photo already uploaded)
  }

  /* -------------------------------- submit -------------------------------- */

  function onSubmit() {
    if (state.busy) return;
    var f = readForm();
    if (!isValid(f)) {
      refresh(); // surface the number error / disabled state
      return;
    }
    clearFormError();
    setBusy(true);
    ensureSession(f)
      .then(function () {
        // Both are optional and non-blocking; run them together so the
        // interaction isn't two round trips long.
        return Promise.all([maybeSendPhoto(), maybeSendPhone(f)]);
      })
      .then(function () {
        FC.contact = {
          whatsapp: f.whatsapp, // E.164, e.g. +27712345678
          whatsappRaw: f.whatsappRaw, // as typed
          consent: true,
        };
        go(nextUrl());
        // leave busy=true through the transition; teardown resets it
      })
      .catch(function (err) {
        setBusy(false);
        /* Kiosk-only failures (never seen on the public site, where no header
           is sent). 401 = the admin revoked this tablet's token; 403 = the
           tablet is disabled. Both are device problems, not form problems.

           NEVER retry without the header: that would quietly create a WEB
           session on a tablet, and the shopper would do the whole quiz only
           to be told at the wheel that they cannot spin. */
        if (err && (err.status === 401 || err.status === 403) && FC.kiosk) {
          if (err.status === 401 && FC.kiosk.unpair)
            FC.kiosk.unpair("401 on session create");
          showFormError(
            err.status === 401
              ? "This tablet needs to be paired again — please ask a team member."
              : "This tablet is temporarily unavailable — please ask a team member."
          );
          return;
        }
        showFormError(
          (err && (err.detail || err.message)) ||
            "Something went wrong. Please try again."
        );
      });
  }

  /* -------------------------- delegated listeners -------------------------- */

  function onClick(e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function") return;

    var submitBtn = t.closest("[data-onboarding-submit]");
    if (submitBtn) {
      e.preventDefault();
      if (!state.form) return; // onboarding page not active
      onSubmit();
      return;
    }

    var backBtn = t.closest("[data-onboarding-back]");
    if (backBtn) {
      e.preventDefault();
      if (!state.form) return;
      var url =
        backBtn.getAttribute("data-onboarding-back") || realHref(backBtn);
      if (url) go(url);
      else if (window.history && window.history.length > 1)
        window.history.back();
      return;
    }

    var genderOpt = t.closest("[data-gender]");
    if (genderOpt && state.form) {
      e.preventDefault();
      state.gender = genderOpt.getAttribute("data-gender");
      reflectGender();
      refresh();
      return;
    }

    // Custom (non-native) consent box. Native checkboxes are handled in onChange.
    var consentEl = t.closest("[data-onboarding-consent]");
    if (consentEl && state.form) {
      var nativeCb =
        (consentEl.matches &&
          consentEl.matches("input[type=checkbox]") &&
          consentEl) ||
        (consentEl.querySelector &&
          consentEl.querySelector("input[type=checkbox]"));
      if (!nativeCb) {
        e.preventDefault();
        state.consent = !state.consent;
        reflectConsent();
        refresh();
      }
      return;
    }
  }

  function onInput(e) {
    if (!state.form) return;
    var t = e.target;
    if (!t || typeof t.closest !== "function") return;
    if (
      t.closest("[data-onboarding-name]") ||
      t.closest("[data-onboarding-whatsapp]")
    )
      refresh();
  }

  function onChange(e) {
    if (!state.form) return;
    var t = e.target;
    if (!t || !t.matches) return;
    // native checkbox path
    var box = t.closest && t.closest("[data-onboarding-consent]");
    if (box && t.matches("input[type=checkbox]")) {
      state.consent = !!t.checked;
      reflectConsent();
      refresh();
    }
  }

  // Webflow forms reload on Enter / native submit — stop that; route to onSubmit.
  // (Harmless with the div/embed approach: no <form> = no submit event fires.)
  function onNativeSubmit(e) {
    if (!e.target || typeof e.target.closest !== "function") return;
    if (e.target.closest("[data-onboarding-form]")) {
      e.preventDefault();
      if (state.form) onSubmit();
    }
  }

  // With a non-native (div/embed) form there's no <form>, so Enter in a field
  // won't submit anything. Wire it ourselves for parity.
  function onKeydown(e) {
    if (!state.form || e.key !== "Enter") return;
    var t = e.target;
    if (!t || typeof t.closest !== "function") return;
    if (
      t.closest("[data-onboarding-name]") ||
      t.closest("[data-onboarding-whatsapp]")
    ) {
      e.preventDefault();
      onSubmit();
    }
  }

  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("submit", onNativeSubmit, true); // capture: beat Webflow

  /* --------------------------- init / teardown --------------------------- */

  function init(scope) {
    var form = findIn(scope || document, "[data-onboarding-form]");
    if (!form) return; // not the onboarding page
    if (state.form === form) return; // already initialised

    state.form = form;
    // Pre-fill from the avatar picker if the user came that way (they already
    // told us there). Still fully editable — this page owns the final value.
    state.gender = FC.avatarGender || null;
    state.consent = false;
    state.busy = false;

    reflectGender();
    reflectConsent();
    showNumberError(false);
    clearFormError();
    setBusy(false);
    refresh(); // sets submit disabled until valid
  }

  function teardown() {
    state.form = null;
    state.gender = null;
    state.consent = false;
    state.busy = false;
  }

  /* ------------------------------ lifecycle ------------------------------ */

  if (window.barba && window.barba.hooks) {
    // afterEnter (not enter): transition.js loads first, so its afterEnter —
    // syncRegions() + LiquidGlass.scan() — has already run by the time we init,
    // meaning the nav buttons + glass are final and won't be pulled out from
    // under us. (Same rationale as flexicare-selfie.js.)
    window.barba.hooks.afterEnter(function (data) {
      init((data && data.next && data.next.container) || document);
    });
    window.barba.hooks.beforeLeave(function (data) {
      var scope = data && data.current && data.current.container;
      if (!scope || findIn(scope, "[data-onboarding-form]") || state.form)
        teardown();
    });
  }
  window.addEventListener("pagehide", teardown);

  function boot() {
    init(document);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  FC.onboarding = { init: init, teardown: teardown, refresh: refresh };
})();
