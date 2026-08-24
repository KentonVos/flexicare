/* ============================================================
   Flexicare Product v1 — the recommendation page  (/flexicare-product)
   ------------------------------------------------------------
   Plain JS (ES5-style). Load AFTER flexicare-core.js, @barba/core and gsap.

   WHAT THIS PAGE DOES
     The last beat of the funnel: the FLEX quiz has finished, the server has
     scored every stored answer, and this page shows the ONE plan it picked.

       1. Read the result. Normally free — flexicare-quiz.js put the
          POST /sessions/{id}/finish response on Flexicare.result before it
          navigated here. On a hard reload / deep link it comes back from
          GET /sessions/{id} (which carries archetype + product + price once
          the session is COMPLETED).
       2. If the session isn't COMPLETED, the user hasn't finished the FLEX
          quiz — bounce to data-product-quiz (default /flexicare).
       3. Personalise: first name, archetype_label, product_label, and the
          price from recommended_price_cents (an integer in CENTS).
       4. Paint the copy database — keyed on BOTH axes, archetype AND product.
       5. The CTA goes on to data-product-next (the spin-to-win page).

     There is no polling and nothing to wait for: unlike the reveal page,
     every value here is already resolved server-side. The only asynchronous
     path is the hard-reload recovery.

   WHY THE COPY IS KEYED ON TWO AXES
     The reveal page's database is keyed on the archetype alone. Here the plan
     copy differs per archetype AND per product — three archetypes times two
     products is six variants of every card, which is exactly the duplication
     the database exists to avoid. So data-copy-for takes an ARCHETYPE:PRODUCT
     pair, either half of which may be "*". See the contract below.

   The session id (from /onboarding, sessionStorage) is required — if it's
   missing we bounce to data-product-onboarding (default /onboarding).

   CONVENTIONS (mirror flexicare-reveal.js)
     • Inits on Barba `afterEnter`; ONE delegated document listener, targets
       re-resolved by attribute at click time (immune to glass rebuilds and
       synced nav buttons). Nothing stale is stored.
     • barba.go() navigation; teardown on beforeLeave + pagehide.
     • Every element lookup is scoped to the INCOMING wrapper first. During a
       swap both containers are in the DOM and the pages are structurally
       similar, so a document-wide lookup is a coin toss — that bug cost the
       reveal page two rounds of debugging (see CLAUDE.md).
     • Respects prefers-reduced-motion.

   ------------------------------------------------------------
   WEBFLOW ATTRIBUTE CONTRACT
     [data-product]             REQUIRED. Wrapper/marker for the page — gates
                                init. Optional config attributes on it:
                                  data-product-next="/spin-to-win"  CTA target.
                                     The CTA's own href / data-product-next
                                     value wins over this. SET THIS — the
                                     fallback is a guess and warns in the
                                     console when it is used.
                                  data-product-onboarding="/onboarding"  bounce
                                     target when there's no session id
                                  data-product-quiz="/flexicare"  bounce target
                                     when the session isn't COMPLETED yet
                                  data-product-lang="en"          (default core lang)
                                  data-product-price-format="From R{amount}/month"
                                     {amount} = recommended_price_cents / 100.
                                     A [data-product-price] element's own
                                     data-product-price-format wins over this,
                                     so a card and a sticky bar can differ.
                                  data-product-price-decimals="0"  0 → R249,
                                     2 → R249.00
                                  data-product-cycle="4000"       ms per item for
                                     slots defined more than once (min 1200)
                                  data-product-cycle-fade="0.4"   seconds of the
                                     crossfade (0 = hard cut)
                                  data-product-debug              console logging
                                  data-product-skeleton="off"     don't inject the
                                     shimmer stylesheet (you style it yourself)

     API-DRIVEN SLOTS (written from the finish result, not the embed):
     [data-product-name]        the first name ("Lerato"). If there is no name
                                and you wrap the greeting in
                                [data-product-name-wrap], that wrapper is
                                hidden — so write the copy to read cleanly
                                without a name, the same way the reveal page
                                does.
     [data-product-echo]        the R03 answer label (Flexicare.echo).
     [data-product-archetype-label]  archetype_label from the API.
     [data-product-label]       product_label ("Flexicare Plus").
     [data-product-code]        the raw product code ("CORE" / "PLUS"), for a
                                badge you'd rather not spell out in the embed.
     [data-product-price]       the formatted price. Hidden (along with
                                [data-product-price-wrap], if present) when
                                recommended_price_cents is null — the API is
                                allowed to return no price.

     THE COPY DATABASE (the main path):
     [data-product-copy]        An HTML Embed holding the copy for every
                                archetype x product combination in one place.
                                Hidden by the script — it's data, not layout.
                                Belongs INSIDE data-barba="container"; if it
                                isn't, the copy is recovered from the incoming
                                page's HTML and a console warning names the
                                problem.

                                  <div data-product-copy>
                                    <div data-copy-for="*">
                                      <div data-copy="plan-heading">Flexicare fits where you are right now.</div>
                                      <div data-copy="plan-benefit">Fixed monthly cost.</div>
                                    </div>
                                    <div data-copy-for="A:PLUS">
                                      <div data-copy="plan-heading">Flexicare Plus fits where you are right now.</div>
                                      <div data-copy="plan-benefit">Full access — doctor, specialist, pathology &amp; more</div>
                                      <div data-copy="plan-benefit">Catches problems early. Chronic conditions managed.</div>
                                      <div data-copy="plan-benefit">Under R50 out of pocket on most visits.</div>
                                    </div>
                                    <div data-copy-for="A:CORE"> … </div>
                                    <div data-copy-for="B:PLUS"> … </div>
                                    …
                                  </div>

                                • The KEY is ARCHETYPE:PRODUCT. Either half may
                                  be "*", and a bare token is understood from
                                  its own vocabulary — A/B/C are archetypes,
                                  CORE/PLUS are products. So:
                                    "A:PLUS"  archetype A on the Plus plan
                                    "A"       = "A:*"   archetype A, either plan
                                    "PLUS"    = "*:PLUS" the Plus plan, any archetype
                                    "*"       the fallback block (so is "default")
                                • Comma-separates alternatives:
                                  data-copy-for="A:PLUS,B:PLUS".
                                • MORE SPECIFIC WINS, slot by slot, and a
                                  winning block REPLACES the slot rather than
                                  merging into it (same rule as the reveal
                                  page). The ladder, lowest first:
                                    "*"  →  a product  →  an archetype  →  a pair
                                  Pinning one of each for the SAME slot is the
                                  only ambiguous case; the archetype block wins,
                                  but don't lean on that — write the pair.
                                • The slot NAME is the target element's Webflow
                                  ID: data-copy="plan-heading" writes into
                                  #plan-heading. ([data-product-slot="plan-heading"]
                                  works too if you'd rather not use IDs.)
                                • REPEAT a slot name to give it several items —
                                  the target then CYCLES through them, all
                                  cycling slots sharing one timer. One item is
                                  static. That is how the three benefit lines in
                                  the design are authored: three
                                  data-copy="plan-benefit" entries, three
                                  elements with that ID... or one element, if
                                  you want them to cycle in place.
                                • Copy is inserted as HTML, so <strong>, <em>
                                  and <br> inside the embed work.
                                • A JSON block is accepted as an alternative:
                                  <script type="application/json" data-product-copy>
                                    { "A:PLUS": { "plan-heading": "…",
                                                  "plan-benefit": ["…", "…"] } }
                                  </script>
                                  (One stray comma kills the whole block — the
                                  script warns and leaves the Webflow copy.)

     [data-product-for="PLUS"]  Whole BLOCKS shown only for a matching
                                archetype/product; non-matching ones are hidden.
                                Takes the same keys as data-copy-for
                                ("A:PLUS", "PLUS", "A,B", "*"). Use it for
                                STRUCTURAL differences — an extra feature row on
                                Plus — that copy alone can't express.

     [data-product-next]        REQUIRED. The CTA ("Spin to win a Clicks
                                voucher"). Value (or href) overrides
                                data-product-next on the wrapper.
     [data-product-back]        Optional. URL value → that page; empty →
                                history.back().
     [data-product-error]       Optional. Element that API errors surface into.

     [data-product-skeleton-target]  Any EXTRA element you want shimmered while
                                the result resolves.
     [data-product-no-skeleton] On any element that would otherwise shimmer, to
                                leave it alone.

   The wrapper also carries data-product-state="loading|ready", so you can
   style the whole page per state in Webflow.

   GLASS: on any glass card use data-anim-fade, never data-anim — glass owns
   transform. Never animate border-radius on a [data-liquid-glass] element.
   ============================================================ */
(function () {
  "use strict";

  if (!window.Flexicare) {
    console.warn("[product] flexicare-core.js must load first.");
    return;
  }
  var FC = window.Flexicare;
  var gsap = window.gsap || null;

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = {
    wrap: null,
    lang: "en",
    token: 0, // bumped on every init/teardown; async work checks it
    archetype: null,
    product: null,
    cycles: [], // { el, items } — copy slots with more than one entry
    cycleTimer: null,
    cycleMs: 4000,
    cycleFade: 0.4,
    cycleIndex: 0,
    sessionReq: null, // in-flight GET /sessions/{id}
    nextHtml: null, // the incoming page's HTML, for the copy-database fallback
    nextDoc: null, // ...parsed, lazily, once per arrival
  };

  function dbg() {
    if (
      window.console &&
      (window.FLEXICARE_DEBUG ||
        (state.wrap && state.wrap.hasAttribute("data-product-debug")))
    ) {
      console.log.apply(console, ["[product]"].concat([].slice.call(arguments)));
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
  function attached(el) {
    return !!(el && document.contains(el));
  }
  // Same page? Compare PATHS only — a query string or hash is not a new page
  // here, and barba.go() drops them anyway.
  function samePath(url) {
    try {
      return (
        new URL(url, location.href).pathname.replace(/\/+$/, "") ===
        location.pathname.replace(/\/+$/, "")
      );
    } catch (e) {
      return false; // unparseable → let the navigation through
    }
  }
  function realHref(el) {
    // Webflow gives Link Blocks a default href="#" — not a destination.
    var h = el && el.getAttribute && el.getAttribute("href");
    return h && h !== "#" ? h : null;
  }
  function go(url) {
    if (!url) return;
    // Never navigate to the page we are already on — that enters it twice.
    if (samePath(url)) {
      dbg("already at", url, "— not navigating");
      return;
    }
    if (window.barba && typeof window.barba.go === "function")
      window.barba.go(url);
    else window.location.href = url;
  }
  function show(el, on) {
    if (el) el.style.display = on ? "" : "none";
  }
  // Scoped like copyTargets(): the incoming wrapper first, the document last.
  function slots(sel) {
    var roots = [];
    if (state.wrap) {
      roots.push(state.wrap);
      var c =
        state.wrap.closest && state.wrap.closest('[data-barba="container"]');
      if (c && c !== state.wrap) roots.push(c);
    }
    roots.push(document);
    for (var i = 0; i < roots.length; i++) {
      var found = all(sel, roots[i]).filter(attached);
      if (found.length) return found;
    }
    return [];
  }
  function setText(sel, text) {
    slots(sel).forEach(function (el) {
      el.textContent = text == null ? "" : text;
    });
  }
  // Is this run still the current one? (teardown / re-init bumps the token.)
  function alive(token) {
    return token === state.token && !!state.wrap;
  }

  function showError(err) {
    var msg = (err && (err.detail || err.message)) || "Something went wrong.";
    if (window.console) console.warn("[product] error:", msg, err);
    var el = slots("[data-product-error]")[0];
    if (el) {
      el.textContent = msg;
      el.style.display = "";
    }
  }
  function clearError() {
    var el = slots("[data-product-error]")[0];
    if (el) {
      el.textContent = "";
      el.style.display = "none";
    }
  }

  /* --------------------------- the result --------------------------- */

  /* Everything this page shows comes out of ONE object: the finish response
     (Flexicare.result) or, on a reload, the completed session. The two shapes
     agree on every field we read — archetype, archetype_label, product,
     product_label, recommended_price_cents — which is why the 409 path in the
     quiz can substitute one for the other. */
  function usable(r) {
    return !!(r && r.archetype && r.product);
  }

  function applySession(s) {
    // The name is in the session too — the surest way to recover it on reload.
    if (s && s.first_name && !FC.firstName) FC.setFirstName(s.first_name);
    // Rebuild the answer map (the quiz page's format) while we're here; the
    // echo recovery below reads it.
    FC.answers = FC.answers || {};
    FC._synced = FC._synced || {};
    ((s && s.answers) || []).forEach(function (a) {
      FC.answers[a.question_code] = a.option_code;
      FC._synced[a.question_code] = a.option_code;
    });
    return s;
  }

  function fetchSession() {
    var id = FC.getSessionId();
    if (!id) return Promise.reject(new Error("no session id"));
    if (!state.sessionReq)
      state.sessionReq = FC.api("/sessions/" + id).then(applySession);
    return state.sessionReq;
  }

  /* Normally free: the FLEX quiz called /finish and stashed the response
     before navigating here. The rest is the hard-reload / deep-link path. */
  function ensureResult() {
    if (usable(FC.result)) return Promise.resolve(FC.result);
    dbg("no result in memory — recovering from the session");
    return fetchSession().then(function (s) {
      if (usable(s)) {
        FC.result = s;
        return s;
      }
      /* A session that exists but has no product means the FLEX stage isn't
         finished — the user deep-linked past it, or reloaded before /finish
         landed. Send them back to the quiz, which resumes at the first
         unanswered question and calls /finish itself. */
      go(attr(state.wrap, "data-product-quiz", "/flexicare"));
      throw new Error("session not completed — returned to the quiz");
    });
  }

  // The R03 echo label, if a reload dropped it: quiz data + stored answers.
  // Memory-only on both sides, so this is a no-op unless /quiz is still cached.
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

  /* ------------------------- the two-axis key ------------------------- */

  /* data-copy-for / data-product-for take ARCHETYPE:PRODUCT, either half
     optional or "*". A bare token is read from its own vocabulary, which is
     unambiguous: A/B/C are archetypes, CORE/PLUS are products.

     Returns a SPECIFICITY, so the caller can let the most specific block win:
       0  "*" / "default"   the fallback
       1  a product only    "PLUS"
       2  an archetype only "A"
       3  both              "A:PLUS"
     ...or null when the key doesn't apply to this user at all. */
  var ARCHETYPES = { A: 1, B: 1, C: 1 };
  var PRODUCTS = { CORE: 1, PLUS: 1 };

  function scoreToken(token, code, product) {
    var t = (token || "").trim().toUpperCase();
    if (!t) return null;
    if (t === "*" || t === "DEFAULT") return 0;

    var parts = t.split(":");
    var wantArch = null;
    var wantProd = null;

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p || p === "*") continue;
      if (ARCHETYPES[p]) wantArch = p;
      else if (PRODUCTS[p]) wantProd = p;
      else return null; // a typo — never silently treat it as a match
    }
    if (wantArch === null && wantProd === null) return 0; // "*:*"

    if (wantArch !== null && String(code || "").toUpperCase() !== wantArch)
      return null;
    if (wantProd !== null && String(product || "").toUpperCase() !== wantProd)
      return null;

    if (wantArch !== null && wantProd !== null) return 3;
    return wantArch !== null ? 2 : 1;
  }

  // The BEST specificity across a comma-separated key, or null if none apply.
  function scoreKey(value, code, product) {
    var list = (value || "").split(",");
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var s = scoreToken(list[i], code, product);
      if (s !== null && (best === null || s > best)) best = s;
    }
    return best;
  }

  /* ------------------------ the copy database ------------------------ */

  /* Where the copy is WRITTEN. Never document.getElementById(): during a Barba
     swap the document briefly holds BOTH containers and getElementById returns
     whichever comes first in DOCUMENT ORDER — which can be the outgoing one.
     That is how a whole page of correct copy once landed in a container that
     was about to be removed. Search the incoming wrapper first, and at every
     level keep only nodes that are actually attached. Every match is written,
     not just the first, so a second copy of a card (another breakpoint) gets
     the copy too. */
  function copyTargets(name) {
    return slots(
      '[id="' + name + '"],[data-product-slot="' + name + '"]'
    );
  }

  /* Where the database is READ from. Normally the live DOM — but the embed only
     reaches the live DOM if Webflow ships it INSIDE data-barba="container".
     Barba swaps nothing else, so an embed parked in the shell is absent on
     every barba.go() arrival and the cards keep the Designer's placeholder
     copy. A hard refresh hides that completely, so it goes unnoticed for a long
     time. Fall back to the INCOMING PAGE'S HTML, which Barba handed us in
     beforeEnter. The database is pure data (we only read innerHTML out of it),
     so a detached DOMParser document does the job. */
  function copySources() {
    var live = all("[data-product-copy]");
    if (live.length) return live;
    if (!state.nextHtml) return [];
    if (!state.nextDoc) {
      try {
        state.nextDoc = new DOMParser().parseFromString(
          state.nextHtml,
          "text/html"
        );
      } catch (e) {
        return [];
      }
    }
    return all("[data-product-copy]", state.nextDoc);
  }

  // → { "plan-heading": ["…"], "plan-benefit": ["…", "…", "…"] }
  // Buckets by specificity so the most specific block wins slot by slot.
  function collectCopy(code, product) {
    var buckets = [{}, {}, {}, {}];

    copySources().forEach(function (src) {
      if (src.tagName === "SCRIPT") {
        var data;
        try {
          data = JSON.parse(src.textContent || "{}");
        } catch (e) {
          // Loud, but never fatal: the page keeps whatever Webflow shipped.
          console.warn(
            "[product] copy JSON is invalid — ignoring it:",
            e.message
          );
          return;
        }
        Object.keys(data || {}).forEach(function (key) {
          var rank = scoreKey(key, code, product);
          if (rank === null) return;
          var block = data[key] || {};
          Object.keys(block).forEach(function (slot) {
            var v = block[slot];
            buckets[rank][slot] =
              Object.prototype.toString.call(v) === "[object Array]"
                ? v.slice()
                : [v];
          });
        });
        return;
      }

      all("[data-copy-for]", src).forEach(function (block) {
        var rank = scoreKey(
          block.getAttribute("data-copy-for"),
          code,
          product
        );
        if (rank === null) return;
        all("[data-copy]", block).forEach(function (el) {
          var slot = el.getAttribute("data-copy");
          if (!slot) return;
          var bucket = buckets[rank];
          (bucket[slot] = bucket[slot] || []).push(el.innerHTML);
        });
      });
    });

    // Least specific first, so a more specific block overwrites the slot
    // entirely rather than merging into it.
    var out = {};
    buckets.forEach(function (bucket) {
      Object.keys(bucket).forEach(function (slot) {
        out[slot] = bucket[slot];
      });
    });
    return out;
  }

  // Every slot name the database mentions, for ANY combination — needed before
  // the result is known, which is why it can't reuse collectCopy().
  function allSlotNames() {
    var seen = {};
    copySources().forEach(function (src) {
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

  function paintDatabaseCopy(code, product) {
    stopCycle();
    // The database is data, not layout — never let it render.
    all("[data-product-copy]").forEach(function (el) {
      if (el.tagName !== "SCRIPT") el.style.display = "none";
    });

    if (!all("[data-product-copy]").length && copySources().length) {
      console.warn(
        "[product] the [data-product-copy] embed is NOT in the live DOM — it " +
          "was read out of the incoming page's HTML instead. That means " +
          'Webflow ships it OUTSIDE data-barba="container", so Barba never ' +
          "swaps it in. The copy is correct, but move the embed INSIDE the " +
          "container."
      );
    }

    var copy = collectCopy(code, product);
    var names = Object.keys(copy);
    if (!names.length) {
      console.warn(
        "[product] no [data-product-copy] database found (live DOM or " +
          "incoming page HTML) — the cards keep the Designer's placeholder " +
          "copy. Check the embed exists on this page and that its " +
          '[data-copy-for] blocks cover "' +
          (code || "?") +
          ":" +
          (product || "?") +
          '" or "*".'
      );
      return;
    }

    names.forEach(function (name) {
      var items = (copy[name] || []).filter(function (t) {
        return t != null && String(t).trim() !== "";
      });
      if (!items.length) return;
      var targets = copyTargets(name);
      if (!targets.length) {
        dbg('slot "' + name + '" has copy but no element with that ID');
        return;
      }
      /* Several items and several elements = a LIST (the three benefit lines
         in the design): hand out one item per element, in order. Several items
         but ONE element = a CYCLE. That distinction is what lets the same
         repeated-slot syntax author both. */
      if (items.length > 1 && targets.length > 1) {
        targets.forEach(function (el, i) {
          if (i < items.length) el.innerHTML = items[i];
          else show(el, false); // more slots than copy — hide the leftovers
        });
        return;
      }
      targets.forEach(function (el) {
        el.innerHTML = items[0];
        if (items.length > 1) state.cycles.push({ el: el, items: items });
      });
    });
    dbg(
      "copy applied",
      names.length + " slots,",
      state.cycles.length + " cycling"
    );
    startCycle();
  }

  /* --------------------------- copy cycling --------------------------- */

  /* All cycling slots share ONE timer so they always change together — the
     same rule as the reveal page's two cards. */
  function stopCycle() {
    if (state.cycleTimer) {
      clearInterval(state.cycleTimer);
      state.cycleTimer = null;
    }
    state.cycles = [];
    state.cycleIndex = 0;
  }

  function swapText(el, html) {
    if (reduceMotion || !gsap || !state.cycleFade) {
      el.innerHTML = html;
      return;
    }
    gsap.to(el, {
      opacity: 0,
      y: -6,
      duration: state.cycleFade / 2,
      ease: "power1.in",
      overwrite: "auto",
      onComplete: function () {
        el.innerHTML = html;
        gsap.fromTo(
          el,
          { opacity: 0, y: 6 },
          {
            opacity: 1,
            y: 0,
            duration: state.cycleFade / 2,
            ease: "power2.out",
            overwrite: "auto",
          }
        );
      },
    });
  }

  function startCycle() {
    if (!state.cycles.length) return;
    state.cycleTimer = setInterval(function () {
      state.cycleIndex++;
      state.cycles.forEach(function (c) {
        // The node may have been swapped out from under us mid-cycle.
        if (!attached(c.el)) return;
        swapText(c.el, c.items[state.cycleIndex % c.items.length]);
      });
    }, state.cycleMs);
  }

  /* --------------------------- API-driven copy --------------------------- */

  function formatPrice(cents, fmtEl) {
    var decimals = parseInt(
      attr(state.wrap, "data-product-price-decimals", "0"),
      10
    );
    if (isNaN(decimals) || decimals < 0) decimals = 0;
    var amount = (cents / 100).toFixed(decimals);
    // Thousands separators, without Intl (this has to run on old Android too).
    var bits = amount.split(".");
    bits[0] = bits[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    amount = bits.join(".");

    var fmt =
      attr(fmtEl, "data-product-price-format", null) ||
      attr(state.wrap, "data-product-price-format", "From R{amount}/month");
    return fmt.replace(/\{amount\}/g, amount);
  }

  function paintResult(r) {
    var name = FC.firstName || "";
    setText("[data-product-name]", name);
    slots("[data-product-name-wrap]").forEach(function (el) {
      show(el, !!name);
    });
    if (FC.echo) setText("[data-product-echo]", FC.echo);
    if (r.archetype_label)
      setText("[data-product-archetype-label]", r.archetype_label);
    if (r.product_label) setText("[data-product-label]", r.product_label);
    if (r.product) setText("[data-product-code]", r.product);

    // The API is allowed to return no price — hide the slot rather than
    // printing "From R0/month" or "From RNaN/month".
    var cents = r.recommended_price_cents;
    var havePrice = typeof cents === "number" && !isNaN(cents);
    slots("[data-product-price]").forEach(function (el) {
      if (havePrice) el.textContent = formatPrice(cents, el);
      show(el, havePrice);
    });
    slots("[data-product-price-wrap]").forEach(function (el) {
      show(el, havePrice);
    });
    if (!havePrice)
      dbg("no recommended_price_cents on the result — price slots hidden");
  }

  // Structural blocks: shown only for a matching archetype/product.
  function applyBlocks(code, product) {
    slots("[data-product-for]").forEach(function (el) {
      var rank = scoreKey(
        el.getAttribute("data-product-for"),
        code,
        product
      );
      show(el, rank !== null);
    });
  }

  /* ------------------------ loading skeleton ------------------------ */

  /* Usually invisible: arriving from the FLEX quiz, Flexicare.result is
     already in memory and the page paints in the same frame. But on a hard
     reload it's GET /sessions/{id} first — a second or two of the Designer's
     placeholder copy, which reads as real copy. So shimmer every slot the
     database is going to write into, plus the name/label/price.

     THE CSS SHIPS WITH THE SCRIPT, and it has to: Barba never swaps the
     <head>, so a <style> in a PAGE's Custom Code is present on a hard load and
     missing on every barba.go() arrival. Injected once into the persistent
     head, flagged data-js-injected so transition.js's shell sync leaves it
     alone. Selectors are :where()-wrapped (zero specificity) and the look is
     driven by custom properties, so anything authored in the SITE head wins
     without !important. */
  var SKELETON_CSS =
    "@keyframes fc-product-shimmer{from{background-position:-150% 0}to{background-position:250% 0}}" +
    ":where([data-product]){--fc-product-skeleton-bg:rgba(255,255,255,.06);--fc-product-skeleton-sheen:rgba(255,255,255,.18);--fc-product-skeleton-speed:1.5s;--fc-product-skeleton-radius:.35em}" +
    ":where([data-product-skeleton]){position:relative;overflow:hidden;color:transparent!important;border-radius:var(--fc-product-skeleton-radius,.35em);background-color:var(--fc-product-skeleton-bg,rgba(255,255,255,.06))}" +
    ':where([data-product-skeleton])::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;background-image:linear-gradient(100deg,rgba(255,255,255,0) 20%,var(--fc-product-skeleton-sheen,rgba(255,255,255,.18)) 50%,rgba(255,255,255,0) 80%);background-size:200% 100%;background-repeat:no-repeat;animation:fc-product-shimmer var(--fc-product-skeleton-speed,1.5s) linear infinite}' +
    ":where([data-product-skeleton] *){visibility:hidden}" +
    // The CTA is live the whole time, but it shouldn't look clickable yet.
    ':where([data-product-state="loading"] [data-product-next]){opacity:.45;transition:opacity .2s ease}' +
    "@media (prefers-reduced-motion:reduce){:where([data-product-skeleton])::after{animation:none}}";

  var cssDone = false;
  function injectCSS(wrap) {
    if (cssDone) return;
    if (wrap && attr(wrap, "data-product-skeleton", "") === "off") {
      cssDone = true; // opt-out: the page styles the skeleton itself
      return;
    }
    if (document.querySelector("style[data-product-skeleton-css]")) {
      cssDone = true;
      return;
    }
    var el = document.createElement("style");
    el.setAttribute("data-product-skeleton-css", "");
    // transition.js's shell sync must not treat this as page-owned markup.
    el.setAttribute("data-js-injected", "");
    el.textContent = SKELETON_CSS;
    (document.head || document.documentElement).appendChild(el);
    cssDone = true;
  }

  function skeletonOn(el) {
    if (!el || !el.setAttribute) return;
    if (el.hasAttribute && el.hasAttribute("data-product-no-skeleton")) return;
    el.setAttribute("data-product-skeleton", "");
  }

  // Called on beforeEnter too, so the shimmer is in place BEFORE the page is
  // visible. Idempotent — re-marking an element is a no-op.
  function markSkeleton(scope) {
    var wrap = resolveWrap(scope);
    if (!wrap) return;
    injectCSS(wrap);
    if (attr(wrap, "data-product-skeleton", "") === "off") return;

    // Hide the database now rather than waiting for paintDatabaseCopy(), or the
    // raw copy blocks flash on a hard load.
    all("[data-product-copy]").forEach(function (el) {
      if (el.tagName !== "SCRIPT") el.style.display = "none";
    });

    if (!wrap.getAttribute("data-product-state"))
      wrap.setAttribute("data-product-state", "loading");

    var targets = all(
      "[data-product-name],[data-product-echo],[data-product-archetype-label]," +
        "[data-product-label],[data-product-code],[data-product-price]," +
        "[data-product-skeleton-target]",
      wrap
    );
    allSlotNames().forEach(function (name) {
      targets = targets.concat(all('[id="' + name + '"],[data-product-slot="' + name + '"]', wrap));
    });
    targets.forEach(skeletonOn);
  }

  function clearSkeleton() {
    all("[data-product-skeleton]").forEach(function (el) {
      el.removeAttribute("data-product-skeleton");
    });
    if (state.wrap) state.wrap.setAttribute("data-product-state", "ready");
  }

  /* --------------------------- navigation --------------------------- */

  function nextUrl() {
    var btn = slots("[data-product-next]")[0];
    var explicit =
      (btn && (attr(btn, "data-product-next", null) || realHref(btn))) ||
      attr(state.wrap, "data-product-next", null);
    if (explicit) return explicit;
    console.warn(
      "[product] no CTA target — set data-product-next on [data-product] (or " +
        "an href on the button). Falling back to /spin-to-win, which is a guess."
    );
    return "/spin-to-win";
  }

  /* ------------------------ delegated listeners ------------------------ */

  function onClick(e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function" || !state.wrap) return;

    var nextBtn = t.closest("[data-product-next]");
    if (nextBtn) {
      e.preventDefault();
      go(nextUrl());
      return;
    }

    var backBtn = t.closest("[data-product-back]");
    if (backBtn) {
      e.preventDefault();
      var url = attr(backBtn, "data-product-back", null) || realHref(backBtn);
      if (url) go(url);
      else if (window.history && window.history.length > 1)
        window.history.back();
      return;
    }
  }
  document.addEventListener("click", onClick);

  /* --------------------------- init / teardown --------------------------- */

  // Matches the other controllers: [data-product] may BE the Barba container.
  function resolveWrap(scope) {
    scope = scope || document;
    if (scope.matches && scope.matches("[data-product]")) return scope;
    var found = scope.querySelector && scope.querySelector("[data-product]");
    if (found) return found;
    if (scope === document) return document.querySelector("[data-product]");

    /* The incoming container has no [data-product], so this is NOT this page.
       No document-wide fallback here — during a swap the OUTGOING container is
       still in the DOM, and falling back to it initialises this controller on
       the page we just left. That exact bug hit the quiz and reveal pages.

       A wrapper parked OUTSIDE the container is a real authoring bug (Barba
       never brings it across) — say so rather than papering over it. */
    var stray = document.querySelector("[data-product]");
    if (stray && !(stray.closest && stray.closest('[data-barba="container"]')))
      console.warn(
        '[product] [data-product] is outside data-barba="container", so Barba ' +
          "never brings it across on a navigation. Move it INSIDE the container."
      );
    return null;
  }

  function init(scope) {
    var wrap = resolveWrap(scope);
    if (!wrap) return; // not the product page
    if (state.wrap === wrap) return; // already initialised

    stopCycle();
    var token = ++state.token;
    state.sessionReq = null; // a new arrival re-reads the session
    state.wrap = wrap;
    state.archetype = null;
    state.product = null;
    state.lang = attr(wrap, "data-product-lang", FC.config.language || "en");
    state.cycleMs = num(wrap, "data-product-cycle", 4000, 1200);
    state.cycleFade = num(wrap, "data-product-cycle-fade", 0.4, 0);

    clearError();
    markSkeleton(wrap); // shimmer first, then paint

    var id = FC.getSessionId();
    if (!id) {
      dbg("no session id — bouncing to onboarding");
      go(attr(wrap, "data-product-onboarding", "/onboarding"));
      return;
    }

    ensureResult()
      .then(function (r) {
        if (!alive(token)) return;
        state.archetype = r.archetype;
        state.product = r.product;
        recoverEcho();
        applyBlocks(r.archetype, r.product);
        paintDatabaseCopy(r.archetype, r.product);
        paintResult(r);
        // AFTER the paints, never before: the slots are colour-transparent
        // while they're written, so the real text is revealed already correct
        // instead of flashing the Designer's placeholder for a frame.
        clearSkeleton();
        dbg("ready", {
          archetype: r.archetype,
          product: r.product,
          price: r.recommended_price_cents,
          name: FC.firstName,
        });
      })
      .catch(function (err) {
        if (!alive(token)) return;
        // Never leave the page shimmering forever, whatever went wrong.
        clearSkeleton();
        if (
          err &&
          err.message &&
          err.message.indexOf("returned to the quiz") !== -1
        )
          return; // already navigating away
        showError(err);
      });
  }

  function teardown() {
    stopCycle();
    all("[data-product-skeleton]").forEach(function (el) {
      el.removeAttribute("data-product-skeleton");
    });
    state.sessionReq = null;
    state.nextHtml = null; // don't hold a whole page's HTML after we leave
    state.nextDoc = null;
    state.token++; // invalidate anything still in flight
    if (state.wrap) state.wrap.removeAttribute("data-product-state");
    state.wrap = null;
    state.archetype = null;
    state.product = null;
  }

  /* ------------------------------ lifecycle ------------------------------ */

  if (window.barba && window.barba.hooks) {
    // afterEnter, like the other controllers: transition.js has already run
    // syncRegions() + LiquidGlass.scan(), so the nav and glass are final.
    window.barba.hooks.afterEnter(function (data) {
      init((data && data.next && data.next.container) || document);
    });
    // Before the page is VISIBLE: mark the skeleton only (DOM-only, no fetch).
    window.barba.hooks.beforeEnter(function (data) {
      // Stashed BEFORE markSkeleton: that reads allSlotNames() out of the copy
      // database, which may have to come from this very HTML string.
      state.nextHtml = (data && data.next && data.next.html) || null;
      state.nextDoc = null;
      markSkeleton((data && data.next && data.next.container) || document);
    });
    window.barba.hooks.beforeLeave(function () {
      if (state.wrap) teardown();
    });
  }
  window.addEventListener("pagehide", teardown);

  /* The shimmer goes on NOW, at script-execution time — not at
     DOMContentLoaded. On a hard load the browser can paint the Designer's
     placeholder copy before DOMContentLoaded fires, which reads as "the copy
     appears, THEN the shimmer starts". Webflow loads these scripts in the
     FOOTER, so the markup above them is already parsed. */
  markSkeleton(document);

  function boot() {
    init(document);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  FC.product = {
    init: init,
    teardown: teardown,
    // Flexicare.product.copy("A", "PLUS") — inspect the resolved database
    copy: collectCopy,
    skeleton: markSkeleton,
  };
})();
