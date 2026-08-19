/* ============================================================
   Flexicare Quiz v1 — dynamic question renderer  (/archetype)
   ------------------------------------------------------------
   Plain JS (ES5-style). Load AFTER flexicare-core.js, @barba/core,
   gsap, and (for glass options) glass.js.

   WHAT THIS PAGE DOES
     Renders a quiz STAGE one question at a time from data fetched
     from the backend, persisting each answer as it's chosen.

       ROUTING stage (this page, /archetype):
         • GET /quiz?lang=en once (cached on the controller so the
           later FLEX page reuses it — no second fetch).
         • Render the 5 ROUTING questions (archetype == null) in order.
         • On each pick: POST /sessions/{id}/answers  (upsert, one answer).
         • R03 has drives_echo — its chosen option LABEL is stashed on
           Flexicare.echo for later pages to echo into copy.
         • After the 5th: POST /routing/preview → store the archetype
           (A/B/C) on Flexicare.archetype, then navigate to data-quiz-done
           (the reveal page — /meet-your-two-selves — NOT a loading screen).

       FLEX stage (a later page, set data-quiz-stage="FLEX"):
         • Same renderer. Shows only the FLEX questions whose
           `archetype` matches Flexicare.archetype (recovered via a
           preview if missing). After the last: POST /sessions/{id}/finish
           → store Flexicare.result, navigate to data-quiz-done.

   The session id (from /onboarding, in sessionStorage) is required —
   if it's missing we bounce to data-quiz-onboarding (default /onboarding).
   Answers + quiz data live on window.Flexicare so they survive Barba
   swaps; on a hard reload they're rebuilt from GET /sessions/{id}.

   CONVENTIONS (mirror flexicare-onboarding.js / flexicare-selfie.js)
     • Inits on Barba `afterEnter`; ONE delegated document listener per
       event, re-resolving targets by attribute at event time (immune to
       glass rebuilds / synced nav buttons). Nothing stale is stored.
     • barba.go() navigation; teardown on beforeLeave + pagehide.
     • Respects prefers-reduced-motion (no blur/opacity transitions).

   ------------------------------------------------------------
   WEBFLOW ATTRIBUTE CONTRACT
     [data-quiz]                REQUIRED. Wrapper/marker for the page. Gates
                                init. Optional config attributes on it:
                                  data-quiz-stage="ROUTING"    (default) | "FLEX"
                                  data-quiz-lang="en"          (default core lang)
                                  data-quiz-done="/meet-your-two-selves"  where to
                                     go when the stage completes (ROUTING → the
                                     archetype reveal, flexicare-reveal.js;
                                     FLEX → results/product page)
                                  data-quiz-onboarding="/onboarding"  bounce target
                                     if there's no session id
                                  data-quiz-routing="/archetype"  (FLEX only) where
                                     to send the user if the archetype can't be
                                     recovered
                                  data-quiz-accent="last"      wrap the prompt's last
                                     word in <span class="quiz-accent"> for the
                                     green-highlight look (off by default)
                                  data-quiz-progress-start="0"  } map this stage's
                                  data-quiz-progress-end="1"    } questions across a
                                     sub-range of the global progress bar (fractions)
                                  data-quiz-progress-format="Question {n} of {total}"

     [data-quiz-prompt]         REQUIRED. Element that receives the question text.
     [data-quiz-helper]         Optional. Receives question.helper (hidden if none).
     [data-quiz-progress-label] Optional. Receives "Question N of M".
     [data-quiz-options]        REQUIRED. Container the option elements render into.
     [data-quiz-option-template] REQUIRED. ONE hidden template option INSIDE the
                                options container. It's cloned per option; each clone
                                gets data-quiz-option + data-option-code and is shown.
                                Put your checkbox/label markup here; tag the text node
                                [data-quiz-option-label]. May carry data-liquid-glass
                                (clones are (re)scanned by glass on render).
     [data-quiz-option-label]   Optional (inside the template). The text slot; if
                                absent the whole clone gets the label text.
     [data-quiz-images]         Optional. Container of per-question images.
     [data-quiz-image-for="R01"] Optional. One per question; the matching one is
                                shown, the rest hidden, as questions change.
     [data-quiz-next]           REQUIRED. The "Next" button (nav bar). Disabled
                                (class is-disabled) until an option is picked.
     [data-quiz-back]           Optional. The "Back" button. Goes to the previous
                                question in place; on question 1 it navigates to
                                data-quiz-back (a URL value) or data-quiz-onboarding.
     [data-quiz-loading]        Optional. Shown while the quiz is fetching; hidden
                                once the first question renders.
     [data-quiz-error]          Optional. Element to surface API errors into.

   Selected option gets class `is-selected` (override per template with
   data-selected-class="YourCombo"). Style it (and .is-selected .yourCheck)
   the same way you did the onboarding gender/consent. Keep the combo applied
   to the template in the Designer so its CSS ships.

   PROGRESS BAR: this controller drives the [data-progress-bar] fill width
   directly as questions advance (transition.js sets it once on enter; we
   take over from there).
   ============================================================ */
(function () {
  "use strict";

  if (!window.Flexicare) {
    console.warn("[quiz] flexicare-core.js must load first.");
    return;
  }
  var FC = window.Flexicare;
  var gsap = window.gsap || null;

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Debug: set window.FLEXICARE_DEBUG = true, or put data-quiz-debug on the
  // [data-quiz] wrapper, to log each init step to the console.
  function dbg() {
    if (
      window.console &&
      (window.FLEXICARE_DEBUG ||
        (state.wrap && state.wrap.hasAttribute("data-quiz-debug")))
    ) {
      console.log.apply(console, ["[quiz]"].concat([].slice.call(arguments)));
    }
  }

  // persistent (survive Barba): FC.quizData, FC.answers, FC._synced,
  // FC.archetype, FC.archetypeLabel, FC.echo, FC.result
  var state = {
    wrap: null,
    stage: "ROUTING",
    lang: "en",
    accent: null,
    progStart: 0,
    progEnd: 1,
    progFmt: "Question {n} of {total}",
    questions: [],
    index: 0,
    pending: null, // in-flight answer POST
    busy: false,
    done: false,
  };

  /* ------------------------------ helpers ------------------------------ */

  function one(sel, root) {
    return (root || document).querySelector(sel);
  }
  function all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function num(el, name, def) {
    var v = el && el.getAttribute(name);
    if (v === null || v === undefined || v === "") return def;
    var n = parseFloat(v);
    return isNaN(n) ? def : n;
  }
  function attr(el, name, def) {
    var v = el && el.getAttribute(name);
    return v === null || v === "" ? def : v;
  }
  function realHref(el) {
    var h = el && el.getAttribute && el.getAttribute("href");
    return h && h !== "#" ? h : null;
  }
  function go(url) {
    if (!url) return;
    if (window.barba && typeof window.barba.go === "function")
      window.barba.go(url);
    else window.location.href = url;
  }
  function findOption(q, code) {
    var list = (q && q.options) || [];
    for (var i = 0; i < list.length; i++)
      if (list[i].code === code) return list[i];
    return null;
  }

  /* ------------------------------ backend ------------------------------ */

  function loadQuiz() {
    // Only trust a cache that actually has routing questions — otherwise an
    // empty/failed first response would stick until a full reload.
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

  // Rebuild the local answer map from the server (source of truth) the first
  // time we need it in this page-load; kept in memory thereafter.
  function loadAnswers() {
    if (FC.answers) return Promise.resolve(FC.answers);
    var id = FC.getSessionId();
    return FC.api("/sessions/" + id).then(function (s) {
      FC.answers = {};
      FC._synced = {};
      (s.answers || []).forEach(function (a) {
        FC.answers[a.question_code] = a.option_code;
        FC._synced[a.question_code] = a.option_code;
      });
      return FC.answers;
    });
  }

  function syncAnswer(qcode, ocode) {
    if (FC._synced && FC._synced[qcode] === ocode) return Promise.resolve();
    var id = FC.getSessionId();
    return FC.api("/sessions/" + id + "/answers", {
      method: "POST",
      body: { answers: [{ question_code: qcode, option_code: ocode }] },
    }).then(function () {
      FC._synced = FC._synced || {};
      FC._synced[qcode] = ocode;
    });
  }

  function routingPayload() {
    var rq = FC.quizData.routing;
    return rq.map(function (q) {
      return { question_code: q.code, option_code: FC.answers[q.code] };
    });
  }

  // FLEX only: recover the archetype if it isn't already known.
  function ensureArchetype() {
    if (FC.archetype) return Promise.resolve();
    var rq = FC.quizData.routing;
    var haveAll = rq.every(function (q) {
      return !!FC.answers[q.code];
    });
    if (!haveAll) {
      go(attr(state.wrap, "data-quiz-routing", "/archetype"));
      return Promise.reject(
        new Error("archetype unknown — returned to routing")
      );
    }
    return FC.api("/routing/preview", {
      method: "POST",
      body: { answers: routingPayload(), language: state.lang },
    }).then(function (res) {
      FC.archetype = res.archetype;
      FC.archetypeLabel = res.archetype_label;
    });
  }

  /* --------------------------- rendering --------------------------- */

  function showLoading(on) {
    var el = one("[data-quiz-loading]");
    if (el) el.style.display = on ? "" : "none";
  }
  function showError(err) {
    var msg = (err && (err.detail || err.message)) || "Something went wrong.";
    if (window.console) console.warn("[quiz] error:", msg, err);
    var el = one("[data-quiz-error]");
    if (el) {
      el.textContent = msg;
      el.style.display = "";
    }
  }

  function setProgress(frac) {
    var bar = one("[data-progress-bar]");
    if (!bar) return;
    var pct = Math.max(0, Math.min(1, frac)) * 100 + "%";
    if (gsap)
      gsap.to(bar, {
        width: pct,
        duration: 0.4,
        ease: "power2.out",
        overwrite: "auto",
      });
    else bar.style.width = pct;
  }
  function setProgressLabel(n, total) {
    var el = one("[data-quiz-progress-label]");
    if (!el) return;
    el.textContent = state.progFmt.replace("{n}", n).replace("{total}", total);
  }

  function setPrompt(q) {
    var el = one("[data-quiz-prompt]");
    if (!el) return;
    var text = q.prompt || "";
    if (state.accent === "last" && text.indexOf(" ") !== -1) {
      var parts = text.split(" ");
      var last = parts.pop();
      el.textContent = parts.join(" ") + " ";
      var span = document.createElement("span");
      span.className = "quiz-accent";
      span.textContent = last;
      el.appendChild(span);
    } else {
      el.textContent = text;
    }
  }
  function setHelper(q) {
    var el = one("[data-quiz-helper]");
    if (!el) return;
    if (q.helper) {
      el.textContent = q.helper;
      el.style.display = "";
    } else {
      el.textContent = "";
      el.style.display = "none";
    }
  }
  function setImage(q) {
    var imgs = all("[data-quiz-image-for]");
    if (!imgs.length) return;
    imgs.forEach(function (el) {
      el.style.display =
        el.getAttribute("data-quiz-image-for") === q.code ? "" : "none";
    });
  }

  function buildOptions(q) {
    var box = one("[data-quiz-options]");
    var tpl = one("[data-quiz-option-template]", box || document);
    if (!box || !tpl) return;

    // remove previous clones (and tidy up their glass)
    all("[data-quiz-option]", box).forEach(function (node) {
      if (window.LiquidGlass && typeof window.LiquidGlass.kill === "function") {
        try {
          window.LiquidGlass.kill(node);
        } catch (e) {}
      }
      if (node.parentNode) node.parentNode.removeChild(node);
    });

    tpl.style.display = "none";
    var chosen = FC.answers[q.code];

    (q.options || []).forEach(function (opt) {
      var clone = tpl.cloneNode(true);
      clone.removeAttribute("data-quiz-option-template");
      clone.setAttribute("data-quiz-option", "");
      clone.setAttribute("data-option-code", opt.code);
      // The clone inherits any transition.js entrance attributes from the
      // template; strip them so the FOUC rule (opacity:0) can't leave clones
      // invisible when they're built after the page's entrance animation ran.
      clone.removeAttribute("data-anim");
      clone.removeAttribute("data-anim-fade");
      clone.removeAttribute("data-text-reveal");
      clone.style.display = "";
      var labelEl = clone.querySelector("[data-quiz-option-label]") || clone;
      labelEl.textContent = opt.label;
      var selCls = clone.getAttribute("data-selected-class") || "is-selected";
      var on = chosen === opt.code;
      clone.classList.toggle(selCls, on);
      clone.setAttribute("aria-pressed", on ? "true" : "false");
      box.appendChild(clone);
    });

    // attach glass to freshly-injected clones (if they use it)
    if (window.LiquidGlass && typeof window.LiquidGlass.scan === "function") {
      try {
        window.LiquidGlass.scan(box);
      } catch (e) {}
    }
  }

  // paint one question's content (no animation)
  function paint(q) {
    setPrompt(q);
    setHelper(q);
    setImage(q);
    buildOptions(q);
  }

  // Force the quiz's dynamic content visible, overriding any leftover hiding
  // from transition.js's FOUC rule / prime state / text-reveal — this is why
  // it rendered on reload but not on navigation.
  function ensureVisible() {
    if (state.wrap && state.wrap.classList)
      state.wrap.classList.add("quiz-ready");
    var box = one("[data-quiz-options]");
    var els = all(
      "[data-quiz-prompt],[data-quiz-options],[data-quiz-images]"
    ).concat(all("[data-quiz-option]", box));
    els.forEach(function (el) {
      el.style.visibility = "visible";
      if (gsap)
        gsap.set(el, { opacity: 1, filter: "none", clearProps: "filter" });
      else el.style.opacity = "1";
    });
  }

  function contentEls() {
    return all("[data-quiz-prompt],[data-quiz-options],[data-quiz-images]");
  }

  function applyState(index) {
    var q = state.questions[index];
    var total = state.questions.length;
    setProgress(
      state.progStart +
        ((index + 1) / total) * (state.progEnd - state.progStart)
    );
    setProgressLabel(index + 1, total);
    setNextEnabled(!!FC.answers[q.code]);
  }

  function firstPaint(index) {
    state.index = index;
    paint(state.questions[index]);
    applyState(index);
    ensureVisible();
    if (!reduceMotion && gsap) {
      gsap.fromTo(
        contentEls(),
        { opacity: 0 },
        { opacity: 1, duration: 0.4, ease: "power2.out", overwrite: "auto" }
      );
    }
  }

  function transitionTo(index) {
    if (reduceMotion || !gsap) {
      state.index = index;
      paint(state.questions[index]);
      applyState(index);
      return;
    }
    var prompt = one("[data-quiz-prompt]");
    var others = all("[data-quiz-options],[data-quiz-images]");
    gsap.to(others, {
      opacity: 0,
      duration: 0.2,
      ease: "power1.in",
      overwrite: "auto",
    });
    gsap.to(prompt, {
      opacity: 0,
      filter: "blur(6px)",
      duration: 0.2,
      ease: "power1.in",
      overwrite: "auto",
      onComplete: function () {
        state.index = index;
        paint(state.questions[index]);
        applyState(index);
        ensureVisible();
        gsap.fromTo(
          all("[data-quiz-options],[data-quiz-images]"),
          { opacity: 0 },
          { opacity: 1, duration: 0.4, ease: "power2.out", overwrite: "auto" }
        );
        gsap.fromTo(
          one("[data-quiz-prompt]"),
          { opacity: 0, filter: "blur(6px)" },
          {
            opacity: 1,
            filter: "blur(0px)",
            duration: 0.45,
            ease: "power2.out",
            overwrite: "auto",
          }
        );
      },
    });
  }

  /* ------------------------------ next state ------------------------------ */

  function setNextEnabled(on) {
    var btn = one("[data-quiz-next]");
    if (!btn) return;
    btn.classList.toggle("is-disabled", !on);
    if (on) btn.removeAttribute("aria-disabled");
    else btn.setAttribute("aria-disabled", "true");
    btn.style.opacity = on ? "" : "0.45";
  }
  function setBusy(on) {
    state.busy = on;
    var btn = one("[data-quiz-next]");
    if (!btn) return;
    btn.classList.toggle("is-busy", on);
    if (on) btn.setAttribute("aria-busy", "true");
    else btn.removeAttribute("aria-busy");
  }

  /* ------------------------------ actions ------------------------------ */

  function selectOption(optEl) {
    var code = optEl.getAttribute("data-option-code");
    var q = state.questions[state.index];
    if (!q || !code) return;

    FC.answers = FC.answers || {};
    FC.answers[q.code] = code;

    var box = one("[data-quiz-options]");
    all("[data-quiz-option]", box).forEach(function (n) {
      var sc = n.getAttribute("data-selected-class") || "is-selected";
      var on = n === optEl;
      n.classList.toggle(sc, on);
      n.setAttribute("aria-pressed", on ? "true" : "false");
    });

    if (q.drives_echo) {
      var opt = findOption(q, code);
      if (opt) FC.echo = opt.label;
    }

    setNextEnabled(true);
    state.pending = syncAnswer(q.code, code).catch(function (err) {
      // 409 = session not IN_PROGRESS; 422 = bad codes (client bug). Don't block
      // the UI on a persistence hiccup — log it; the final call will re-score.
      if (window.console)
        console.warn(
          "[quiz] answer sync failed:",
          err && (err.detail || err.message)
        );
    });
  }

  function next() {
    if (state.busy) return;
    var q = state.questions[state.index];
    if (!q || !FC.answers[q.code]) return; // nothing chosen
    setBusy(true);
    Promise.resolve(state.pending)
      .then(function () {
        if (state.index < state.questions.length - 1) {
          setBusy(false);
          transitionTo(state.index + 1);
        } else {
          completeStage();
        }
      })
      .catch(function () {
        // even if the sync promise rejected, allow advancing; server re-scores
        if (state.index < state.questions.length - 1) {
          setBusy(false);
          transitionTo(state.index + 1);
        } else {
          completeStage();
        }
      });
  }

  function back() {
    if (state.busy) return;
    if (state.index > 0) {
      transitionTo(state.index - 1);
    } else {
      go(
        attr(state.wrap, "data-quiz-back", null) ||
          realHref(one("[data-quiz-back]")) ||
          attr(state.wrap, "data-quiz-onboarding", "/onboarding")
      );
    }
  }

  function completeStage() {
    setBusy(true);
    var id = FC.getSessionId();
    if (state.stage === "FLEX") {
      FC.api("/sessions/" + id + "/finish", { method: "POST" })
        .then(function (res) {
          FC.result = res;
          state.done = true;
          go(attr(state.wrap, "data-quiz-done", "/results"));
        })
        .catch(function (err) {
          if (err && err.status === 409) {
            // already finished — re-fetch and proceed
            FC.api("/sessions/" + id).then(function (s) {
              FC.result = s;
              go(attr(state.wrap, "data-quiz-done", "/results"));
            });
          } else {
            setBusy(false);
            showError(err);
          }
        });
    } else {
      FC.api("/routing/preview", {
        method: "POST",
        body: { answers: routingPayload(), language: state.lang },
      })
        .then(function (res) {
          FC.archetype = res.archetype;
          FC.archetypeLabel = res.archetype_label;
          state.done = true;
          go(attr(state.wrap, "data-quiz-done", "/meet-your-two-selves"));
        })
        .catch(function (err) {
          setBusy(false);
          showError(err);
        });
    }
  }

  /* ------------------------- delegated listeners ------------------------- */

  function onClick(e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function" || !state.wrap) return;

    var opt = t.closest("[data-quiz-option]");
    if (opt) {
      e.preventDefault();
      selectOption(opt);
      return;
    }
    var nextBtn = t.closest("[data-quiz-next]");
    if (nextBtn) {
      e.preventDefault();
      next();
      return;
    }
    var backBtn = t.closest("[data-quiz-back]");
    if (backBtn) {
      e.preventDefault();
      back();
      return;
    }
  }
  document.addEventListener("click", onClick);

  /* --------------------------- init / teardown --------------------------- */

  function buildQuestionList() {
    if (state.stage === "FLEX") {
      state.questions = FC.quizData.flex.filter(function (q) {
        return q.archetype === FC.archetype;
      });
    } else {
      state.questions = FC.quizData.routing;
    }
  }
  function firstUnanswered() {
    for (var i = 0; i < state.questions.length; i++)
      if (!FC.answers[state.questions[i].code]) return i;
    return state.questions.length;
  }

  // Resolve [data-quiz] whether it's ON the passed scope (e.g. the Barba
  // container itself), a descendant of it, or — as a last resort — anywhere in
  // the document. querySelector alone can't match its own root element, which
  // is why nav-in failed but a full reload worked.
  function resolveWrap(scope) {
    scope = scope || document;
    if (scope.matches && scope.matches("[data-quiz]")) return scope;
    var found = scope.querySelector && scope.querySelector("[data-quiz]");
    if (found) return found;
    return scope !== document ? document.querySelector("[data-quiz]") : null;
  }

  function init(scope) {
    var wrap = resolveWrap(scope);
    if (!wrap) return; // not a quiz page
    if (state.wrap === wrap) return; // already initialised

    state.wrap = wrap;
    state.stage = (
      attr(wrap, "data-quiz-stage", "ROUTING") || "ROUTING"
    ).toUpperCase();
    state.lang = attr(wrap, "data-quiz-lang", FC.config.language || "en");
    state.accent = attr(wrap, "data-quiz-accent", null);
    state.progStart = num(wrap, "data-quiz-progress-start", 0);
    state.progEnd = num(wrap, "data-quiz-progress-end", 1);
    state.progFmt = attr(
      wrap,
      "data-quiz-progress-format",
      "Question {n} of {total}"
    );
    state.index = 0;
    state.busy = false;
    state.done = false;
    state.pending = null;

    var id = FC.getSessionId();
    dbg(
      "init: stage",
      state.stage,
      "lang",
      state.lang,
      "session",
      id ? "present" : "MISSING"
    );
    if (!id) {
      dbg(
        "no session → bounce to",
        attr(wrap, "data-quiz-onboarding", "/onboarding")
      );
      go(attr(wrap, "data-quiz-onboarding", "/onboarding"));
      return;
    }

    setNextEnabled(false);
    showLoading(true);

    loadQuiz()
      .then(function (qd) {
        dbg("quiz loaded: routing", qd.routing.length, "flex", qd.flex.length);
        return loadAnswers();
      })
      .then(function (ans) {
        dbg("answers loaded:", Object.keys(ans || {}).length);
        return state.stage === "FLEX" ? ensureArchetype() : null;
      })
      .then(function () {
        buildQuestionList();
        showLoading(false);
        dbg("questions for stage:", state.questions.length);
        if (!state.questions.length) {
          showError({ message: "No questions to show for this stage." });
          return;
        }
        var start = firstUnanswered();
        dbg("start index:", start, "of", state.questions.length);
        if (start >= state.questions.length) {
          completeStage(); // stage already fully answered (resume) → finish it
          return;
        }
        firstPaint(start);
        dbg("painted question", start + 1);
      })
      .catch(function (err) {
        showLoading(false);
        if (
          err &&
          err.message &&
          err.message.indexOf("returned to routing") !== -1
        )
          return; // already navigated away
        showError(err);
      });
  }

  function teardown() {
    if (state.wrap && state.wrap.classList)
      state.wrap.classList.remove("quiz-ready");
    state.wrap = null;
    state.questions = [];
    state.index = 0;
    state.busy = false;
    state.done = false;
    state.pending = null;
  }

  function bindBarba() {
    var h = window.barba && window.barba.hooks;
    if (!h) return false;
    // afterEnter fires on every navigation (not first load — boot() covers that).
    if (h.afterEnter)
      h.afterEnter(function (data) {
        init((data && data.next && data.next.container) || document);
      });
    // `after` fires slightly later; harmless backup (init is idempotent) in case
    // anything upstream swallows afterEnter.
    if (h.after)
      h.after(function (data) {
        init((data && data.next && data.next.container) || document);
      });
    if (h.beforeLeave)
      h.beforeLeave(function () {
        teardown(); // always clear; re-init happens on the next afterEnter
      });
    return true;
  }
  // Bind now if Barba is ready; otherwise poll briefly (covers the case where
  // this file happens to evaluate before @barba/core has defined window.barba).
  if (!bindBarba()) {
    var _bt = 0;
    var _biv = setInterval(function () {
      if (bindBarba() || ++_bt > 100) clearInterval(_biv);
    }, 50);
  }
  window.addEventListener("pagehide", teardown);

  function boot() {
    init(document);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  FC.quiz = { init: init, teardown: teardown };
})();
