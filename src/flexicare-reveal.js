/* ============================================================
   Flexicare Reveal v1 — "Meet your two selves"  (/meet-your-two-selves)
   ------------------------------------------------------------
   Plain JS (ES5-style). Load AFTER flexicare-core.js and @barba/core
   (order relative to the other page controllers doesn't matter — this
   only depends on the core; it reuses FC.quizData if the quiz page
   already fetched it).

   WHAT THIS PAGE DOES
     It is the ARCHETYPE REVEAL — the beat between the ROUTING quiz and
     the FLEX quiz. It replaces the old /loading page: the two things
     that used to justify a loading screen (the routing preview and the
     generated image pair) both resolve here, on screen, with the copy
     already visible.

       1. Makes sure we know the archetype (A/B/C). Normally the quiz
          page already ran POST /routing/preview and left it on
          Flexicare.archetype; on a HARD RELOAD of this page it is
          recovered: GET /sessions/{id} → (a completed session already
          carries `archetype`; otherwise) re-run the preview from the
          stored routing answers. If the five routing answers aren't
          all there, we bounce back to data-reveal-routing.
       2. Personalises the copy — first name, archetype label, and the
          R03 "echo" (the drives_echo answer label), which is recovered
          from the quiz data + stored answers if it was lost.
       3. Fills the cards from the COPY DATABASE — one hidden Webflow
          Embed holding every archetype's copy, keyed by slot name to the
          element IDs on the page (#with-cover-heading, #with-cover-text,
          and the without- pair). Slots with several entries cycle on a
          shared timer. See the attribute contract below.
       4. Polls GET /sessions/{id}/images every ~2.5s until READY, then
          drops the generated pair into the two cards. The page NEVER
          blocks on this — the copy renders immediately and the images
          fade in when they arrive. PENDING (no photo was ever
          confirmed), FAILED, or a timeout all fall through to the same
          graceful fallback state; the CTA stays live throughout.
          ONLY THE SELFIE PATH EVER GENERATES. If the user picked an
          avatar, its with/without-cover pair is pre-approved and stored,
          so the very first poll returns READY (api-contract §3.8) —
          "developing…" and FAILED are selfie-path states. Same code
          either way; it just resolves on call one.
       5. The CTA goes on to the FLEX quiz page (data-reveal-next).

   The session id (from /onboarding, sessionStorage) is required — if it's
   missing we bounce to data-reveal-onboarding (default /onboarding).

   IMAGE URLS EXPIRE IN 10 MINUTES (they're presigned). That's why we
   render straight from a fresh poll and never persist them anywhere; if
   the user sits on this page longer than that and the images have gone
   stale, re-entering the page re-polls and gets fresh URLs.

   CONVENTIONS (mirror flexicare-quiz.js / flexicare-onboarding.js)
     • Inits on Barba `afterEnter` (after transition.js's syncRegions() +
       LiquidGlass.scan()); ONE delegated document click listener,
       re-resolving targets by attribute at click time.
     • barba.go() navigation; teardown on beforeLeave + pagehide, which
       also stops the poll timer and invalidates in-flight requests
       (see the run token) so a fast navigation can't write into the
       next page's DOM.
     • Respects prefers-reduced-motion (no image fade).

   ------------------------------------------------------------
   WEBFLOW ATTRIBUTE CONTRACT
     [data-reveal]              REQUIRED. Wrapper/marker for the page — gates
                                init. Optional config attributes on it:
                                  data-reveal-next="/flex"        CTA target: the
                                     FLEX quiz page (the one with
                                     data-quiz-stage="FLEX"). The CTA's own
                                     href / data-reveal-next value wins over this.
                                  data-reveal-onboarding="/onboarding"  bounce
                                     target when there's no session id
                                  data-reveal-routing="/archetype"  bounce target
                                     when the archetype can't be recovered
                                  data-reveal-lang="en"           (default core lang)
                                  data-reveal-poll="2500"         ms between
                                     /images polls (min 1000)
                                  data-reveal-timeout="90000"     ms before we give
                                     up waiting for images and show the fallback
                                  data-reveal-debug               console logging
                                  data-reveal-skeleton="off"      don't inject the
                                     shimmer CSS / don't shimmer anything; you
                                     style the loading states yourself

     LOADING SKELETON (the shimmer over the copy + images — no new elements):
                                Until the archetype resolves, the only copy on
                                screen is the Designer's placeholder text. So on
                                entry the wrapper gets
                                data-reveal-copy-state="loading" and every slot
                                the copy database is going to write into — plus
                                [data-reveal-name], [data-reveal-archetype-label]
                                and [data-reveal-echo] — gets
                                data-reveal-skeleton, which turns its text
                                transparent and shimmers the box. The attribute
                                is removed (and the state flips to "ready") once
                                the real copy is in, so the text is revealed
                                already correct rather than flashing the
                                placeholder. On a Barba arrival this happens on
                                beforeEnter, i.e. BEFORE the page is visible.
                                  The image cards shimmer the same way, keyed to
                                data-reveal-state, and stop when the pair is
                                READY or the fallback shows.
                                THE CSS SHIPS WITH THE SCRIPT (Barba never swaps
                                the <head>, so a page-level <style> is there on a
                                hard load and gone on a barba.go() arrival). Tune
                                it with CSS variables on [data-reveal]:
                                --fc-reveal-skeleton-bg / -sheen / -speed /
                                -radius. Overriding needs no !important — the
                                injected selectors are :where()-wrapped, so they
                                carry zero specificity.
     [data-reveal-no-skeleton]  On any element that would otherwise shimmer, to
                                leave it alone (e.g. an inline ", Lerato" span
                                you'd rather stayed blank than flickered).
     [data-reveal-skeleton-target] On any EXTRA element you want shimmered while
                                the copy loads — anything the auto-marking above
                                doesn't already cover.
     [data-reveal-image-frame]  Optional, on the wrapper around a
                                [data-reveal-image]: this is what shimmers while
                                the image is pending. Without it the image's own
                                parent is used, which is usually right — add the
                                attribute when the parent is the whole card.
                                While pending, the image itself is held at
                                opacity 0 (marked data-reveal-image-pending), so
                                Webflow's placeholder asset can't show through
                                the shimmer. It keeps its box, so nothing
                                reflows; it's revealed the moment the real file
                                has decoded. If the pair never arrives the
                                placeholder comes back, so a page with no
                                [data-reveal-images-fallback] is never blank.

     Copy slots (all optional — each is filled only if present):
     [data-reveal-name]         gets the first name ("Lerato"). If the name is
                                unknown the element is emptied and, if it carries
                                data-reveal-name-wrap, that wrapper is hidden —
                                use it on the ", Lerato" span so the headline
                                reads cleanly without a name.
     [data-reveal-archetype-label]  gets archetype_label from the API.
     [data-reveal-echo]         gets the R03 answer label (Flexicare.echo).

     Archetype copy — THE DATABASE (this is the main path):
     [data-reveal-copy]         An HTML Embed holding ALL the per-archetype copy
                                for every card, in one place, instead of six
                                duplicated cards in the Designer. It is hidden by
                                the script (it's data, not layout). Inside it:

                                  <div data-reveal-copy>
                                    <div data-copy-for="A">
                                      <div data-copy="without-cover-heading">…</div>
                                      <div data-copy="without-cover-text">…</div>
                                      <div data-copy="without-cover-text">…</div>
                                      <div data-copy="with-cover-heading">…</div>
                                      <div data-copy="with-cover-text">…</div>
                                    </div>
                                    <div data-copy-for="B"> … </div>
                                    <div data-copy-for="C"> … </div>
                                  </div>

                                • data-copy-for="*" (or "default") = fallback
                                  block; "A,B" = applies to both. A slot defined
                                  for the archetype REPLACES the default one.
                                • The slot NAME is the target's Webflow ID, so
                                  data-copy="with-cover-heading" writes into
                                  #with-cover-heading. Any slot name works —
                                  the four the design uses are
                                    with-cover-heading   without-cover-heading
                                    with-cover-text      without-cover-text
                                  ([data-reveal-slot="with-cover-heading"] is
                                  accepted as an alternative to the ID.)
                                • REPEAT a slot name to give it several items —
                                  the target then CYCLES through them (see
                                  data-reveal-cycle). One item = static.
                                • The copy is inserted as HTML, so <strong>,
                                  <em> and <br> inside the embed work.
                                • A JSON block is also accepted if you prefer:
                                  <script type="application/json" data-reveal-copy>
                                    { "A": { "with-cover-text": ["…", "…"] } }
                                  </script>
                                  (One stray comma kills the whole block — the
                                  script warns in the console and leaves the
                                  Webflow copy untouched.)

     The cycling swap animates opacity + a 6px y on the TARGET, so put the ID on
     the text element itself, never on a [data-liquid-glass] card (glass owns
     transform). Text inside a glass card is fine.

     Cycling config (on the [data-reveal] wrapper):
                                  data-reveal-cycle="4000"      ms per item (min
                                     1200). All cycling slots share ONE timer, so
                                     the two cards always change together.
                                  data-reveal-cycle-fade="0.4"  seconds of the
                                     crossfade (0 = hard cut). Reduced motion and
                                     a missing GSAP both fall back to a hard cut.

     Optional, still supported alongside the database:
     [data-reveal-for="A"]      Whole BLOCKS shown only for a matching archetype
                                ("A,B" allowed); non-matching ones are hidden.
                                Use for structural differences the copy database
                                can't express (a whole extra card, say).
     The wrapper also gets data-archetype="A|B|C", so CSS-only variants work too:
     [data-archetype="B"] .fc-card { ... }

     Generated images:
     [data-reveal-image="without"]  the "Without Cover" image
     [data-reveal-image="with"]     the "With Cover" image
                                Put this on the <img> itself (we set src) or on
                                any other element (we set background-image).
                                Gets class `is-loaded` once the file has actually
                                decoded, so you can fade it in from CSS.
     [data-reveal-images-loading]   shown while status is GENERATING — the SELFIE
                                    path only; an avatar session is READY on the
                                    first poll, so this never appears for it.
                                    Hidden once READY / failed. Your
                                    "developing…" shimmer.
     [data-reveal-images-fallback]  shown when there are no images (PENDING — no
                                    photo was ever confirmed — or FAILED, or
                                    timeout).
                                    Put your stock/illustrated pair in here.
     [data-reveal-error]        Optional. Element that API errors surface into.

     Buttons (delegated — they may live in the persistent nav bar):
     [data-reveal-next]         REQUIRED. "See what your decision leads to →".
                                Value (or href) overrides data-reveal-next on the
                                wrapper. Gets `is-disabled` only while the
                                archetype is still resolving.
     [data-reveal-back]         Optional. URL value → that page; empty → history.

   The wrapper also carries data-reveal-state="loading|ready|fallback" for the
   images and data-reveal-copy-state="loading|ready" for the copy, so you can
   drive card states purely from CSS if you prefer.

   PROGRESS BAR (owned by transition.js): set data-progress="0.6" on this
   page's Barba container.
   GLASS: on any glass card use data-anim-fade, never data-anim.
   ============================================================ */
(function () {
  "use strict";

  if (!window.Flexicare) {
    console.warn("[reveal] flexicare-core.js must load first.");
    return;
  }
  var FC = window.Flexicare;

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = {
    wrap: null,
    lang: "en",
    pollMs: 2500,
    timeoutMs: 90000,
    timer: null,
    deadline: 0,
    token: 0, // bumped on every init/teardown; async work checks it
    archetype: null,
    cycles: [], // { el, items } — copy slots with more than one entry
    cycleTimer: null,
    cycleMs: 4000,
    cycleFade: 0.4,
    cycleIndex: 0,
  };

  function dbg() {
    if (
      window.console &&
      (window.FLEXICARE_DEBUG ||
        (state.wrap && state.wrap.hasAttribute("data-reveal-debug")))
    ) {
      console.log.apply(console, ["[reveal]"].concat([].slice.call(arguments)));
    }
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
  function realHref(el) {
    // Webflow gives Link Blocks a default href="#" — not a destination.
    var h = el && el.getAttribute && el.getAttribute("href");
    return h && h !== "#" ? h : null;
  }
  function go(url) {
    if (!url) return;
    if (window.barba && typeof window.barba.go === "function")
      window.barba.go(url);
    else window.location.href = url;
  }
  function show(el, on) {
    if (el) el.style.display = on ? "" : "none";
  }
  function setText(sel, text) {
    all(sel).forEach(function (el) {
      el.textContent = text == null ? "" : text;
    });
  }
  // Is this run still the current one? (teardown / re-init bumps the token.)
  function alive(token) {
    return token === state.token && !!state.wrap;
  }

  function showError(err) {
    var msg = (err && (err.detail || err.message)) || "Something went wrong.";
    if (window.console) console.warn("[reveal] error:", msg, err);
    var el = one("[data-reveal-error]");
    if (el) {
      el.textContent = msg;
      el.style.display = "";
    }
  }
  function clearError() {
    var el = one("[data-reveal-error]");
    if (el) {
      el.textContent = "";
      el.style.display = "none";
    }
  }

  function setBusy(on) {
    all("[data-reveal-next]").forEach(function (btn) {
      if (btn.classList) btn.classList.toggle("is-disabled", !!on);
      btn.setAttribute("aria-disabled", on ? "true" : "false");
    });
  }

  function setImagesState(name) {
    if (state.wrap) state.wrap.setAttribute("data-reveal-state", name);
    show(one("[data-reveal-images-loading]"), name === "loading");
    show(one("[data-reveal-images-fallback]"), name === "fallback");
    // Anything that isn't "loading" is a settled state (READY, or the
    // fallback pair is now on screen) — stop shimmering the image frames.
    if (name !== "loading") clearImageSkeleton();
  }

  /* --------------------------- archetype --------------------------- */

  // Normally free: the quiz page ran the preview before navigating here.
  // Everything below is the hard-reload / deep-link recovery path.
  function ensureArchetype() {
    if (FC.archetype) return Promise.resolve(FC.archetype);
    var id = FC.getSessionId();
    dbg("archetype unknown — recovering from the session");

    return FC.api("/sessions/" + id).then(function (s) {
      // Name is in the session too — the surest way to recover it on reload.
      if (s && s.first_name && !FC.firstName) FC.setFirstName(s.first_name);

      // Rebuild the local answer map (the quiz page's format) while we're here.
      FC.answers = FC.answers || {};
      FC._synced = FC._synced || {};
      (s.answers || []).forEach(function (a) {
        FC.answers[a.question_code] = a.option_code;
        FC._synced[a.question_code] = a.option_code;
      });

      // A completed session already carries the resolved archetype.
      if (s && s.archetype) {
        FC.archetype = s.archetype;
        FC.archetypeLabel = s.archetype_label;
        return FC.archetype;
      }
      return loadQuiz().then(function (data) {
        var routing = data.routing;
        var haveAll =
          routing.length &&
          routing.every(function (q) {
            return !!FC.answers[q.code];
          });
        if (!haveAll) {
          // Not far enough through the funnel to be on this page.
          go(attr(state.wrap, "data-reveal-routing", "/archetype"));
          throw new Error("routing answers incomplete — returned to the quiz");
        }
        return FC.api("/routing/preview", {
          method: "POST",
          body: {
            answers: routing.map(function (q) {
              return { question_code: q.code, option_code: FC.answers[q.code] };
            }),
            language: state.lang,
          },
        }).then(function (res) {
          FC.archetype = res.archetype;
          FC.archetypeLabel = res.archetype_label;
          return FC.archetype;
        });
      });
    });
  }

  // Same cache the quiz page uses — usually already populated, so free.
  function loadQuiz() {
    if (FC.quizData && FC.quizData.routing && FC.quizData.routing.length)
      return Promise.resolve(FC.quizData);
    return FC.api("/quiz?lang=" + encodeURIComponent(state.lang)).then(
      function (list) {
        if (!list || !list.length)
          throw new Error("GET /quiz returned no questions");
        var routing = [],
          flex = [];
        list.forEach(function (q) {
          if (q.archetype == null) routing.push(q);
          else flex.push(q);
        });
        FC.quizData = { all: list, routing: routing, flex: flex };
        return FC.quizData;
      }
    );
  }

  // The R03 echo label, if a reload dropped it: quiz data + stored answers.
  function recoverEcho() {
    if (FC.echo || !FC.quizData || !FC.answers) return;
    var routing = FC.quizData.routing || [];
    for (var i = 0; i < routing.length; i++) {
      var q = routing[i];
      if (!q.drives_echo) continue;
      var picked = FC.answers[q.code];
      if (!picked) return;
      var opts = q.options || [];
      for (var j = 0; j < opts.length; j++)
        if (opts[j].code === picked) {
          FC.echo = opts[j].label;
          return;
        }
    }
  }

  /* ---------------------------- rendering ---------------------------- */

  function paintCopy() {
    var name = FC.firstName || "";
    setText("[data-reveal-name]", name);
    all("[data-reveal-name-wrap]").forEach(function (el) {
      show(el, !!name);
    });
    if (FC.archetypeLabel)
      setText("[data-reveal-archetype-label]", FC.archetypeLabel);
    if (FC.echo) setText("[data-reveal-echo]", FC.echo);
  }

  /* ------------------------ the copy database ------------------------ */
  /* All the per-archetype card copy lives in ONE Webflow Embed instead of six
     duplicated cards. Two formats are accepted; use whichever you prefer.

     A. MARKUP (recommended — you can bold/italic/<br> inside the copy):

       <div data-reveal-copy>
         <div data-copy-for="A">
           <div data-copy="without-cover-heading">Too busy to be sick. Until you weren't.</div>
           <div data-copy="without-cover-text">3 days in hospital. R12,000 gone.</div>
           <div data-copy="without-cover-text">Two weeks off work. No income.</div>
           <div data-copy="with-cover-heading">You made time. Before you had to.</div>
           <div data-copy="with-cover-text">One visit. Under R50 out of pocket.</div>
         </div>
         <div data-copy-for="B"> … </div>
         <div data-copy-for="C"> … </div>
       </div>

     B. JSON (compact, but one stray comma breaks the block):

       <script type="application/json" data-reveal-copy>
         { "A": { "with-cover-heading": "…", "with-cover-text": ["…", "…"] } }
       </script>

     Rules for both:
       • data-copy-for="*" (or "default") is the fallback block. A slot defined
         for the archetype REPLACES the default entirely — the two never merge.
       • data-copy-for="A,B" applies to both.
       • The slot NAME is the target element's Webflow ID: a slot called
         with-cover-heading writes into #with-cover-heading. (If you'd rather
         not use IDs, [data-reveal-slot="with-cover-heading"] works too.)
       • Repeating a slot name = multiple items → the target CYCLES through
         them (see startCycle). One item = static text.
       • The embed itself is hidden by the script — it's data, not layout. */

  function copyTargets(name) {
    var byId = document.getElementById(name);
    if (byId) return [byId];
    return all('[data-reveal-slot="' + name + '"]');
  }

  function matchesArchetype(value, code) {
    var list = (value || "").split(",");
    for (var i = 0; i < list.length; i++) {
      var v = list[i].trim().toUpperCase();
      if (v === "*" || v === "DEFAULT") return "default";
      if (code && v === code.toUpperCase()) return "match";
    }
    return null;
  }

  // → { "with-cover-heading": ["…"], "with-cover-text": ["…", "…"] }
  function collectCopy(code) {
    var defaults = {},
      specific = {};

    all("[data-reveal-copy]").forEach(function (src) {
      if (src.tagName === "SCRIPT") {
        var data;
        try {
          data = JSON.parse(src.textContent || "{}");
        } catch (e) {
          // Loud, but never fatal: the page keeps whatever Webflow shipped.
          console.warn("[reveal] copy JSON is invalid — ignoring it:", e.message);
          return;
        }
        Object.keys(data || {}).forEach(function (key) {
          var where = matchesArchetype(key, code);
          if (!where) return;
          var bucket = where === "match" ? specific : defaults;
          var block = data[key] || {};
          Object.keys(block).forEach(function (slot) {
            var v = block[slot];
            bucket[slot] = Object.prototype.toString.call(v) === "[object Array]"
              ? v.slice()
              : [v];
          });
        });
        return;
      }

      all("[data-copy-for]", src).forEach(function (block) {
        var where = matchesArchetype(
          block.getAttribute("data-copy-for"),
          code
        );
        if (!where) return;
        var bucket = where === "match" ? specific : defaults;
        all("[data-copy]", block).forEach(function (el) {
          var slot = el.getAttribute("data-copy");
          if (!slot) return;
          (bucket[slot] = bucket[slot] || []).push(el.innerHTML);
        });
      });
    });

    // Archetype copy replaces the default slot-by-slot (never merges into it).
    var out = {};
    Object.keys(defaults).forEach(function (k) {
      out[k] = defaults[k];
    });
    Object.keys(specific).forEach(function (k) {
      out[k] = specific[k];
    });
    return out;
  }

  function paintDatabaseCopy(code) {
    stopCycle();
    // The database is data, not layout — never let it render.
    all("[data-reveal-copy]").forEach(function (el) {
      if (el.tagName !== "SCRIPT") el.style.display = "none";
    });

    var copy = collectCopy(code);
    var slots = Object.keys(copy);
    if (!slots.length) {
      // Loud, not dbg(): on a barba.go() arrival this is almost always the
      // embed being parked OUTSIDE data-barba="container". Barba only swaps the
      // container, so the incoming page's embed is never inserted and the page
      // silently keeps the Designer's placeholder copy — which looks like real
      // copy, so nobody notices. A hard reload hides the bug completely.
      console.warn(
        "[reveal] no [data-reveal-copy] database in the DOM — the cards keep " +
          "the Designer's placeholder copy. If this page is fine after a hard " +
          "refresh but not on arrival, the embed is outside " +
          'data-barba="container": move it INSIDE the container.'
      );
      return;
    }

    slots.forEach(function (name) {
      var items = (copy[name] || []).filter(function (t) {
        return t != null && String(t).trim() !== "";
      });
      if (!items.length) return;
      copyTargets(name).forEach(function (el) {
        el.innerHTML = items[0];
        if (items.length > 1) state.cycles.push({ el: el, items: items });
      });
    });
    dbg("copy applied", slots.length + " slots,", state.cycles.length + " cycling");
    startCycle();
  }

  /* --------------------------- copy cycling --------------------------- */
  /* Every cycling slot advances on ONE shared timer, so the two cards change
     together instead of drifting apart. A slot with fewer items just wraps
     (index % items.length), so a 3-item and a 2-item side stay in step. */

  function swapText(el, html) {
    if (el.innerHTML === html) return;
    if (reduceMotion || !window.gsap) {
      el.innerHTML = html;
      return;
    }
    var d = state.cycleFade;
    window.gsap.to(el, {
      opacity: 0,
      y: -6,
      duration: d,
      ease: "power2.in",
      onComplete: function () {
        if (!el.parentNode) return;
        el.innerHTML = html;
        window.gsap.fromTo(
          el,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: d, ease: "power2.out" }
        );
      },
    });
  }

  function startCycle() {
    if (!state.cycles.length) return;
    state.cycleIndex = 0;
    state.cycleTimer = setInterval(function () {
      state.cycleIndex++;
      state.cycles.forEach(function (c) {
        swapText(c.el, c.items[state.cycleIndex % c.items.length]);
      });
    }, state.cycleMs);
  }

  function stopCycle() {
    if (state.cycleTimer) clearInterval(state.cycleTimer);
    state.cycleTimer = null;
    state.cycles = [];
    state.cycleIndex = 0;
  }

  function paintArchetype(code) {
    state.archetype = code || null;
    if (state.wrap && code) state.wrap.setAttribute("data-archetype", code);
    all("[data-reveal-for]").forEach(function (el) {
      var want = (el.getAttribute("data-reveal-for") || "")
        .split(",")
        .map(function (s) {
          return s.trim().toUpperCase();
        });
      show(el, !!code && want.indexOf(code.toUpperCase()) !== -1);
    });
    dbg("archetype", code);
  }

  /* ------------------------ loading skeleton ------------------------ */

  /* The gap this fills: this page paints the Designer's PLACEHOLDER copy the
     moment it appears, and the real copy only lands once the archetype is
     known. Arriving by barba.go() from the quiz that's a microtask (the quiz
     already ran the preview) — but on a HARD RELOAD or a deep link it's
     GET /sessions/{id} (+ maybe /quiz + POST /routing/preview), i.e. seconds
     of lorem-ipsum-looking template text. So we shimmer every slot the copy
     database is going to write into, plus the name/label/echo, until the real
     text arrives.

     THE CSS SHIPS WITH THE SCRIPT, and it has to: Barba never swaps the
     <head>, so a <style> in a PAGE's Custom Code is present on a hard load
     and missing on every barba.go() arrival. Injected once into the
     persistent head, flagged data-js-injected so transition.js's shell sync
     leaves it alone. Selectors are :where()-wrapped (zero specificity) and
     the look is driven by custom properties, so anything you author in the
     SITE head wins without !important. Opt out entirely with
     data-reveal-skeleton="off" on [data-reveal]; exclude one element with
     data-reveal-no-skeleton on it. */
  var SKELETON_CSS =
    "@keyframes fc-reveal-shimmer{from{background-position:-150% 0}to{background-position:250% 0}}" +
    ":where([data-reveal]){--fc-reveal-skeleton-bg:rgba(255,255,255,.06);--fc-reveal-skeleton-sheen:rgba(255,255,255,.18);--fc-reveal-skeleton-speed:1.5s;--fc-reveal-skeleton-radius:.35em}" +
    // Text slots: the words go transparent, the box becomes the shimmer bar.
    ":where([data-reveal-skeleton]){position:relative;overflow:hidden;color:transparent!important;border-radius:var(--fc-reveal-skeleton-radius,.35em);background-color:var(--fc-reveal-skeleton-bg,rgba(255,255,255,.06))}" +
    ':where([data-reveal-skeleton])::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;background-image:linear-gradient(100deg,rgba(255,255,255,0) 20%,var(--fc-reveal-skeleton-sheen,rgba(255,255,255,.18)) 50%,rgba(255,255,255,0) 80%);background-size:200% 100%;background-repeat:no-repeat;animation:fc-reveal-shimmer var(--fc-reveal-skeleton-speed,1.5s) linear infinite}' +
    // Anything nested inside a shimmering slot (an icon, a nested span) goes quiet.
    ":where([data-reveal-skeleton] *){visibility:hidden}" +
    // Image frames shimmer the same way, and the placeholder <img> inside them
    // is hidden until setImage() flags it is-loaded.
    ":where([data-reveal-skeleton-frame]){position:relative;overflow:hidden;background-color:var(--fc-reveal-skeleton-bg,rgba(255,255,255,.06))}" +
    ':where([data-reveal-skeleton-frame])::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;background-image:linear-gradient(100deg,rgba(255,255,255,0) 20%,var(--fc-reveal-skeleton-sheen,rgba(255,255,255,.18)) 50%,rgba(255,255,255,0) 80%);background-size:200% 100%;background-repeat:no-repeat;animation:fc-reveal-shimmer var(--fc-reveal-skeleton-speed,1.5s) linear infinite}' +
    // Marked on the image ITSELF, so it doesn't depend on the wrapper's state
    // attribute having been stamped yet (markSkeleton can run before init).
    ":where([data-reveal-image-pending]){opacity:0!important}" +
    // The CTA is live the whole time, but it shouldn't look clickable yet.
    ':where([data-reveal-copy-state="loading"] [data-reveal-next]){opacity:.45;transition:opacity .2s ease}' +
    "@media (prefers-reduced-motion:reduce){:where([data-reveal-skeleton],[data-reveal-skeleton-frame])::after{animation:none}}";

  var cssDone = false;
  function injectCSS(wrap) {
    if (cssDone) return;
    if (wrap && attr(wrap, "data-reveal-skeleton", "") === "off") {
      cssDone = true; // opt-out: the page styles the skeleton itself
      return;
    }
    if (document.querySelector("style[data-reveal-skeleton-css]")) {
      cssDone = true;
      return;
    }
    var el = document.createElement("style");
    el.setAttribute("data-reveal-skeleton-css", "");
    // transition.js's shell sync must not treat this as page-owned markup.
    el.setAttribute("data-js-injected", "");
    el.textContent = SKELETON_CSS;
    (document.head || document.documentElement).appendChild(el);
    cssDone = true;
  }

  // Every slot name the copy database mentions, for ANY archetype — we need
  // these before the archetype is known, which is exactly why it can't reuse
  // collectCopy(code).
  function allSlotNames() {
    var seen = {};
    all("[data-reveal-copy]").forEach(function (src) {
      if (src.tagName === "SCRIPT") {
        var data;
        try {
          data = JSON.parse(src.textContent || "{}");
        } catch (e) {
          return; // paintDatabaseCopy warns about this; don't warn twice
        }
        Object.keys(data || {}).forEach(function (key) {
          Object.keys(data[key] || {}).forEach(function (slot) {
            seen[slot] = true;
          });
        });
        return;
      }
      all("[data-copy]", src).forEach(function (el) {
        var slot = el.getAttribute("data-copy");
        if (slot) seen[slot] = true;
      });
    });
    return Object.keys(seen);
  }

  // The frame that shimmers for an image: an explicit [data-reveal-image-frame]
  // ancestor if there is one, otherwise the image's own parent.
  function imageFrame(el) {
    if (!el) return null;
    var explicit = el.closest && el.closest("[data-reveal-image-frame]");
    return explicit || el.parentNode || null;
  }

  function skeletonOn(el, marker) {
    if (!el || !el.setAttribute) return;
    if (el.hasAttribute && el.hasAttribute("data-reveal-no-skeleton")) return;
    el.setAttribute(marker, "");
  }

  // Called on beforeEnter too, so the shimmer is already in place BEFORE the
  // page is visible. Idempotent — re-marking an element is a no-op.
  function markSkeleton(scope) {
    var wrap = resolveWrap(scope);
    if (!wrap) return;
    injectCSS(wrap);
    if (attr(wrap, "data-reveal-skeleton", "") === "off") return;

    // The database is data, not layout — hide it now rather than waiting for
    // paintDatabaseCopy(), or the raw copy blocks flash on a hard load.
    all("[data-reveal-copy]").forEach(function (el) {
      if (el.tagName !== "SCRIPT") el.style.display = "none";
    });

    wrap.setAttribute("data-reveal-copy-state", "loading");

    var targets = all(
      "[data-reveal-name],[data-reveal-archetype-label],[data-reveal-echo]," +
        "[data-reveal-skeleton-target]"
    );
    allSlotNames().forEach(function (name) {
      targets = targets.concat(copyTargets(name));
    });
    targets.forEach(function (el) {
      skeletonOn(el, "data-reveal-skeleton");
    });

    // Stamped here as well as in setImagesState(): this can run on beforeEnter,
    // where state.wrap isn't set yet, and the placeholder must already be gone.
    if (!wrap.getAttribute("data-reveal-state"))
      wrap.setAttribute("data-reveal-state", "loading");

    var frames = 0;
    all("[data-reveal-image]").forEach(function (img) {
      if (img.classList && img.classList.contains("is-loaded")) return;
      skeletonOn(imageFrame(img), "data-reveal-skeleton-frame");
      frames++;
      if (img.hasAttribute && img.hasAttribute("data-reveal-no-skeleton")) return;
      // Webflow ships these with a placeholder asset, and a semi-transparent
      // shimmer sheen on top of it still reads as "a grey square photo".
      // Inline opacity so no Webflow rule or interaction can outrank it.
      img.setAttribute("data-reveal-image-pending", "");
      img.style.opacity = "0";
    });
    dbg("skeleton on:", targets.length, "text slots,", frames, "image frames");
  }

  function clearCopySkeleton() {
    if (state.wrap) state.wrap.setAttribute("data-reveal-copy-state", "ready");
    all("[data-reveal-skeleton]").forEach(function (el) {
      el.removeAttribute("data-reveal-skeleton");
    });
  }

  function unhideImage(el) {
    if (!el) return;
    el.removeAttribute("data-reveal-image-pending");
    if (el.style && el.style.opacity === "0") el.style.opacity = "";
  }

  function clearImageSkeleton() {
    all("[data-reveal-skeleton-frame]").forEach(function (el) {
      el.removeAttribute("data-reveal-skeleton-frame");
    });
    // Anything that never arrived goes back to whatever Webflow shipped — a
    // page with no [data-reveal-images-fallback] must not end up blank.
    all("[data-reveal-image-pending]").forEach(unhideImage);
  }

  /* ------------------------- generated images ------------------------- */

  // <img> → src; anything else → background-image. Decodes first so the swap
  // never shows a half-painted frame, then flags is-loaded for the CSS fade.
  function setImage(el, url, token) {
    if (!el || !url) return;
    var pre = new Image();
    pre.onload = function () {
      if (!alive(token) || !el.parentNode) return;
      if (el.tagName === "IMG") {
        el.removeAttribute("srcset"); // Webflow adds one; it would win over src
        el.src = url;
      } else {
        el.style.backgroundImage = 'url("' + url + '")';
      }
      if (el.classList) el.classList.add("is-loaded");
      unhideImage(el); // drop the skeleton's inline opacity:0 first
      if (!reduceMotion && window.gsap)
        window.gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5 });
    };
    pre.onerror = function () {
      dbg("image failed to load", url);
    };
    pre.src = url;
  }

  function applyImages(res, token) {
    var withUrl = res && res.with_insurance_url;
    var withoutUrl = res && res.without_insurance_url;
    if (!withUrl && !withoutUrl) return false;
    setImage(one('[data-reveal-image="with"]'), withUrl, token);
    setImage(one('[data-reveal-image="without"]'), withoutUrl, token);
    return true;
  }

  // Poll until READY (or PENDING/FAILED/timeout → fallback). Never blocks the
  // page: the copy and the CTA are live the whole time.
  function pollImages(token) {
    if (!alive(token)) return;
    FC.api("/sessions/" + FC.getSessionId() + "/images")
      .then(function (res) {
        if (!alive(token)) return;
        var status = (res && res.status) || "PENDING";
        dbg("images", status);
        FC.images = res || null;

        if (status === "READY") {
          setImagesState(applyImages(res, token) ? "ready" : "fallback");
          return;
        }
        if (status === "GENERATING") {
          if (Date.now() > state.deadline) {
            dbg("images timed out — showing fallback");
            setImagesState("fallback");
            return;
          }
          setImagesState("loading");
          state.timer = setTimeout(function () {
            pollImages(token);
          }, state.pollMs);
          return;
        }
        // PENDING (no photo was ever confirmed — selfie skipped, or the avatar
        // PATCH failed) or FAILED (selfie generation only) — graceful fallback.
        setImagesState("fallback");
      })
      .catch(function (err) {
        if (!alive(token)) return;
        // Images are optional; a 404 or a network blip must not break the page.
        dbg("images poll failed", (err && err.message) || err);
        setImagesState("fallback");
      });
  }

  function stopPolling() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }

  /* --------------------------- navigation --------------------------- */

  function nextUrl() {
    var btn = one("[data-reveal-next]");
    return (
      (btn && (attr(btn, "data-reveal-next", null) || realHref(btn))) ||
      attr(state.wrap, "data-reveal-next", "/flex")
    );
  }

  /* ------------------------ delegated listeners ------------------------ */

  function onClick(e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function" || !state.wrap) return;

    var nextBtn = t.closest("[data-reveal-next]");
    if (nextBtn) {
      e.preventDefault();
      // The FLEX page needs the archetype; if it's still resolving, wait for it
      // rather than sending the user to a page that would bounce them back.
      if (!state.archetype) {
        dbg("CTA pressed before the archetype resolved — holding");
        return;
      }
      go(nextUrl());
      return;
    }

    var backBtn = t.closest("[data-reveal-back]");
    if (backBtn) {
      e.preventDefault();
      var url = attr(backBtn, "data-reveal-back", null) || realHref(backBtn);
      if (url) go(url);
      else if (window.history && window.history.length > 1)
        window.history.back();
      return;
    }
  }
  document.addEventListener("click", onClick);

  /* --------------------------- init / teardown --------------------------- */

  // Matches the quiz page's resolver: [data-reveal] may BE the Barba container.
  function resolveWrap(scope) {
    scope = scope || document;
    if (scope.matches && scope.matches("[data-reveal]")) return scope;
    var found = scope.querySelector && scope.querySelector("[data-reveal]");
    if (found) return found;
    return scope !== document ? document.querySelector("[data-reveal]") : null;
  }

  function init(scope) {
    var wrap = resolveWrap(scope);
    if (!wrap) return; // not the reveal page
    if (state.wrap === wrap) return; // already initialised

    stopPolling();
    stopCycle();
    var token = ++state.token;
    state.wrap = wrap;
    state.archetype = null;
    state.lang = attr(wrap, "data-reveal-lang", FC.config.language || "en");
    state.pollMs = num(wrap, "data-reveal-poll", 2500, 1000);
    state.timeoutMs = num(wrap, "data-reveal-timeout", 90000, 5000);
    state.cycleMs = num(wrap, "data-reveal-cycle", 4000, 1200);
    state.cycleFade = num(wrap, "data-reveal-cycle-fade", 0.4, 0);
    state.deadline = Date.now() + state.timeoutMs;

    clearError();
    // Shimmer first, THEN paint: paintCopy() only knows the name so far, so
    // without this the placeholder card copy sits there looking real.
    markSkeleton(wrap);
    paintCopy(); // whatever we already know, on screen immediately
    setImagesState("loading");

    var id = FC.getSessionId();
    if (!id) {
      dbg("no session id — bouncing to onboarding");
      go(attr(wrap, "data-reveal-onboarding", "/onboarding"));
      return;
    }

    // Images and archetype resolve INDEPENDENTLY — neither waits on the other.
    pollImages(token);

    setBusy(true);
    ensureArchetype()
      .then(function (code) {
        if (!alive(token)) return;
        recoverEcho();
        paintArchetype(code);
        paintDatabaseCopy(code); // the embed → the four ID'd slots
        paintCopy(); // name/label may have arrived with the session fetch
        // AFTER the paints, never before: the slots are still colour-transparent
        // while they're written, so the real text is revealed already correct
        // instead of flashing the Designer's placeholder for a frame.
        clearCopySkeleton();
        setBusy(false);
        dbg("ready", { archetype: code, name: FC.firstName });
      })
      .catch(function (err) {
        if (!alive(token)) return;
        // The archetype is unrecoverable (or we're bouncing to routing) —
        // either way, never leave the page shimmering forever.
        clearCopySkeleton();
        setBusy(false);
        showError(err);
      });
  }

  function teardown() {
    stopPolling();
    stopCycle();
    clearImageSkeleton();
    state.token++; // invalidate anything still in flight
    state.wrap = null;
    state.archetype = null;
  }

  /* ------------------------------ lifecycle ------------------------------ */

  if (window.barba && window.barba.hooks) {
    // afterEnter, like the other controllers: transition.js has already run
    // syncRegions() + LiquidGlass.scan(), so the nav buttons and glass are final.
    window.barba.hooks.afterEnter(function (data) {
      init((data && data.next && data.next.container) || document);
    });
    // Before the page is VISIBLE: mark the skeleton only (DOM-only, no fetch),
    // so the arrival never flashes the Designer's placeholder copy.
    window.barba.hooks.beforeEnter(function (data) {
      markSkeleton((data && data.next && data.next.container) || document);
    });
    window.barba.hooks.beforeLeave(function () {
      if (state.wrap) teardown();
    });
  }
  window.addEventListener("pagehide", teardown);

  function boot() {
    init(document);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  FC.reveal = {
    init: init,
    teardown: teardown,
    poll: pollImages,
    copy: collectCopy, // Flexicare.reveal.copy("A") — inspect the database
    skeleton: markSkeleton, // Flexicare.reveal.skeleton() — re-shimmer, to look at it
  };
})();
