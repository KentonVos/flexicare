/* ============================================================
   Flexicare Product v1 — the recommendation page  (/flexicare-product)
   ------------------------------------------------------------
   Plain JS (ES5-style). Load AFTER flexicare-core.js, @barba/core and gsap.

   WHAT THIS PAGE DOES
     The last beat of the WEB funnel: the FLEX quiz has finished, the server
     has scored every stored answer, and this page shows the ONE plan it
     picked. (On a kiosk the journey carries on to /spin-to-win — see
     data-product-next-web below and src/flexicare-spin.js.)

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
                                  data-product-next-web="/thank-you"  CTA target
                                     used INSTEAD of data-product-next when this
                                     device is not a paired kiosk. The prize
                                     wheel is kiosk-only (a WEB session gets a
                                     409 from POST /spin), so this is how web
                                     visitors skip /spin-to-win. Leave it unset
                                     and everyone goes to data-product-next.
                                     IGNORED while ?demo is armed — see the
                                     demo-mode notes in flexicare-spin.js.
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
                                     slots that opted into cycling with
                                     data-product-cycle-slot (min 1200)
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
                                • REPEAT a slot name to give it several items.
                                  They all end up on screen TOGETHER; how
                                  depends on what the page offers for that
                                  slot, in this order:
                                    1. a [data-product-list] container → the
                                       items are CLONED from one authored
                                       template inside it (see below).
                                    2. several elements with that ID → one item
                                       each, in order.
                                    3. ONE element → that element is itself
                                       cloned in place, once per item, as
                                       siblings after itself. So the plain
                                       build needs no wrapper: put the ID on
                                       the benefit row and five items give you
                                       five rows. Mark a [data-product-row]
                                       ancestor if the arrow glyph is a SIBLING
                                       of the ID'd text element — that ancestor
                                       is then what gets cloned. Clones carry
                                       [data-product-clone="<slot>"] and are
                                       rebuilt on every paint; the ID stays on
                                       the original only (duplicate IDs are
                                       invalid and would confuse the next
                                       paint).
                                  One item is always just static text.
                                • To make a multi-item slot ROTATE instead of
                                  listing, put data-product-cycle-slot on its
                                  element. Cycling is opt-in: a list is the
                                  common case, a rotating slot the exception.
                                • Copy is inserted as HTML, so <strong>, <em>
                                  and <br> inside the embed work.
                                • TOKENS are substituted into every slot:
                                    {name}       the first name
                                    {price}      "From R249/month"
                                    {amount}     just "249"
                                    {product}    product_label
                                    {archetype}  archetype_label
                                    {echo}       the R03 answer label
                                  So the copy can read "Your Flex, {name}." as
                                  one sentence instead of being split around a
                                  [data-product-name] span. When a token
                                  resolves to NOTHING, one comma-or-space run
                                  immediately before it is eaten too, so a
                                  missing name leaves "Your Flex." rather than
                                  "Your Flex, ." An unknown token is left
                                  visible — that is how a typo gets noticed.
                                • A JSON block is accepted as an alternative:
                                  <script type="application/json" data-product-copy>
                                    { "A:PLUS": { "plan-heading": "…",
                                                  "plan-benefit": ["…", "…"] } }
                                  </script>
                                  (One stray comma kills the whole block — the
                                  script warns and leaves the Webflow copy.)

     LIST TEMPLATES (the benefit lines):
     [data-product-list="plan-benefit"]  A container for a repeated slot. Build
                                ONE item inside it, mark that item
                                [data-product-list-template], and the script
                                clones it per copy entry — so a list that is 4
                                lines for one archetype and 5 for another needs
                                no extra Webflow work.
                                CONTAINER OUTSIDE, TEMPLATE INSIDE. Getting
                                those two the wrong way round is easy to do and
                                the symptom looks unrelated (the text clones
                                without its icon row), so the script detects the
                                swap, renders it the intended way round, and
                                warns with what to change.
     [data-product-list-template]  The ONE authored item, INSIDE the container.
                                Keep it styled and visible in the Designer (the
                                card never looks empty while you work); the
                                script hides it at paint time. Clones get
                                [data-product-list-item] and are rebuilt on
                                every paint, with data-anim/-anim-fade/
                                -text-reveal stripped (they'd otherwise inherit
                                the entrance rule and stay invisible) and glass
                                re-scanned.
     [data-product-row]         Optional, on an ANCESTOR of a copy slot: when
                                that slot has several items and only one
                                element, THIS is the element cloned per item.
                                Use it when the ID sits on the text and the row
                                also holds an arrow glyph or an icon, so the
                                clones keep the whole row.
     [data-product-cycle-slot]  Optional, on a copy slot's element: its items
                                ROTATE (crossfading, sharing one timer with
                                every other cycling slot) instead of being
                                listed. Opt-in.

     [data-product-list-text]   Optional, INSIDE the template: the text slot. If
                                absent the whole clone gets the text — so put
                                this on the text element whenever the item also
                                holds an arrow glyph or an icon, or the glyph is
                                overwritten. It's also what shimmers while the
                                copy loads.

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
    result: null, // the finish response — token interpolation reads it
    lists: {}, // slot name -> { box, tpl } with tpl DETACHED (see resolveList)
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

  /* ------------------------ token interpolation ------------------------ */

  /* The copy is written by a copywriter, in the embed, with the personalised
     bits inline — "Your Flex, {name}." reads as one sentence there instead of
     being split into three elements with a [data-product-name] span in the
     middle. So substitute the handful of values we know into every slot as it
     is painted.

       {name}       the first name, or "" when we don't have one
       {price}      the formatted price ("From R249/month")
       {amount}     just the number ("249")
       {product}    product_label ("Flexicare Plus")
       {archetype}  archetype_label
       {echo}       the R03 answer label

     An unknown token is left alone rather than blanked — a stray brace in the
     copy stays visible, which is how a typo gets noticed.

     PUNCTUATION: an empty {name} would leave "Your Flex, ." So when a token
     resolves to nothing, one comma-or-space run immediately before it is eaten
     too. That is why the copy can be written as though the name is always
     there. */
  function tokenValue(key) {
    var r = state.result || {};
    switch (key) {
      case "name":
        return FC.firstName || "";
      case "price":
        return priceText(null);
      case "amount":
        return amountText();
      case "product":
        return r.product_label || "";
      case "archetype":
        return r.archetype_label || "";
      case "echo":
        return FC.echo || "";
    }
    return null; // unknown → leave the token in place
  }

  function interpolate(html) {
    if (html == null || html.indexOf("{") === -1) return html;
    return String(html).replace(
      /([,\s]*)\{([a-z]+)\}/gi,
      function (whole, lead, key) {
        var v = tokenValue(key.toLowerCase());
        if (v === null) return whole; // unknown token — leave it visible
        if (v === "") return ""; // eat the leading comma/space run too
        return lead + v;
      }
    );
  }

  /* Force a freshly-injected row visible. TWO separate rules hide authored
     content until its entrance animation runs, and a clone inherits both:

       transition.js  .lg-anim [data-anim]:not([data-text-reveal]),
                      .lg-anim [data-anim-fade]:not([data-text-reveal])
                      { opacity: 0 }
       text-reveal.js .tr-ready [data-text-reveal] { visibility: hidden }

     Clones are built during afterEnter, AFTER both of those animations have
     already run, so nothing will ever come along and reveal them — they just
     stay invisible. Stripping the attributes from the clone's ROOT is not
     enough: the attribute is usually on the TEXT element INSIDE the row, which
     is how four cloned rows rendered with their check icons and no words.
     Measured 2026-08-25. So sweep the root AND every descendant, and clear the
     inline hiding text-reveal may already have applied to the template.

     text-reveal also sets visibility on the element ITSELF once it has
     processed it, which no attribute sweep can undo — so each element in the
     pass gets its inline visibility cleared too. Only those elements, though:
     a blanket "un-hide everything inline-hidden in this row" would also reveal
     anything the template hides on purpose.

     Same treatment the quiz gives its option clones (ensureVisible). */
  function unhide(root) {
    if (!root) return;
    var els = [root].concat(
      all(
        "[data-anim],[data-anim-fade],[data-text-reveal],[data-product-skeleton]",
        root
      )
    );
    els.forEach(function (el) {
      el.removeAttribute("data-anim");
      el.removeAttribute("data-anim-fade");
      el.removeAttribute("data-text-reveal");
      el.removeAttribute("data-product-skeleton");
      clearInlineMotion(el);
    });
    /* And the whole subtree, attribute or not. The transform above is applied by
       GSAP to the ELEMENT, and a clone taken mid-tween carries it whether or not
       it still has the attribute that earned it. */
    clearInlineMotion(root);
    all("*", root).forEach(clearInlineMotion);
  }

  /* Wipe the inline state an in-flight entrance animation leaves behind.

     THIS IS THE ONE THAT BIT HARDEST. transition.js animates [data-anim]
     elements in from an offset (gsap sets `transform: translate(0, Npx)` and
     `opacity: 0` inline, then clears both when the tween finishes). Our clones
     are built during afterEnter — WHILE that tween is still running — so they
     are born holding a mid-flight transform, and the tween that would have
     cleared it is pointed at the template, which by then is detached. Nothing
     ever clears the clones, so every row sits permanently offset.

     The symptom is nasty because it looks structural: the check-wrapper has no
     data-anim so it stays put, while the text element inside the same row is
     pushed down about one row's height. The result reads as "the text is
     shifted one row down; the first row has no text and the last has no
     check", when in fact every row is correct and only the text is displaced.
     Measured 2026-08-25.

     Only INLINE properties are cleared, so anything authored through a Webflow
     class is untouched. */
  function clearInlineMotion(el) {
    if (!el || !el.style) return;
    if (gsap) {
      gsap.set(el, {
        clearProps: "transform,translate,rotate,scale,opacity,filter,visibility",
      });
    } else {
      el.style.transform = "";
      el.style.opacity = "";
      el.style.filter = "";
      el.style.visibility = "";
    }
    // gsap's clearProps doesn't touch `visibility` reliably (text-reveal sets it
    // directly, not through gsap), so make sure of it.
    if (el.style.visibility === "hidden") el.style.visibility = "";
  }

  /* --------------------------- list templates --------------------------- */

  /* The benefit lines are a LIST of unknown length that differs per
     archetype/product, so Webflow can't author them as fixed elements. Same
     answer as the quiz's options: build ONE item in the Designer, marked
     [data-product-list-template], and clone it per entry.

       <div data-product-list="plan-benefit">
         <div data-product-list-template>
           <div class="arrow">-></div>
           <div data-product-list-text>Doctor access for the whole household</div>
         </div>
       </div>

     The template stays in the Designer, styled and visible, so the card never
     looks empty while you work on it — the script hides it at paint time. */
  /* Resolve the pair {container, template}, and TAKE THE TEMPLATE OUT OF THE
     DOM the first time we see it.

     Why removal rather than hiding: the authored template is a real, styled row
     sitting in the container, so while it is in the document it is a visible
     empty row above the real ones — which reads as "the text is shifted down by
     one". Hiding it is the obvious fix and it kept not sticking: an inline
     display:none loses to a Webflow class with !important, and an attribute
     rule of our own gets inherited by the clones (which are made FROM the
     template) and hides the entire list instead. A DETACHED node cannot render,
     no matter what any stylesheet says, so this removes the whole class of bug.

     We keep a pristine detached CLONE and delete the original, then clone from
     that copy on every paint. The container stays in the DOM, so the cached
     entry is valid for as long as it is attached.

     The contract is container OUTSIDE, template INSIDE. Getting those the wrong
     way round is easy and the symptom looks unrelated, so the inversion (and
     both attributes on one element) is detected, recovered, and warned about.
     Measured 2026-08-25. */
  function resolveList(name) {
    // Already taken: the template lives only in memory now.
    var cached = state.lists[name];
    if (cached && attached(cached.box)) return cached;

    var marked = slots('[data-product-list="' + name + '"]')[0];
    if (!marked) return null;

    var box = null;
    var tpl = null;

    // The intended shape: the template is a descendant of the container.
    var inner = one("[data-product-list-template]", marked);
    if (inner) {
      box = marked;
      tpl = inner;
    } else if (
      marked.hasAttribute("data-product-list-template") &&
      marked.parentNode
    ) {
      // Both attributes on ONE element: it can't be its own container.
      console.warn(
        '[product] data-product-list="' +
          name +
          '" and data-product-list-template are on the SAME element. Put the ' +
          "list attribute on the WRAPPER and the template attribute on the " +
          "one item inside it. Using the parent as the container for now."
      );
      box = marked.parentNode;
      tpl = marked;
    } else {
      // Inverted: the template attribute is on an ANCESTOR.
      var outer =
        marked.closest && marked.closest("[data-product-list-template]");
      if (outer) {
        console.warn(
          '[product] the list attributes for "' +
            name +
            '" are swapped: data-product-list-template is on the WRAPPER and ' +
            'data-product-list="' +
            name +
            '" is on the item inside it. It should be the other way round — ' +
            "the container holds the list attribute, the ONE item inside it " +
            "holds the template attribute. Rendering it the intended way " +
            "round for now."
        );
        box = outer;
        tpl = marked;
      }
    }

    if (!box) return { box: marked, tpl: null }; // renderList reports it
    if (!tpl) return { box: box, tpl: null };

    /* Keep a pristine copy and delete the authored one. Pristine BEFORE any
       clone-time edits, and before markSkeleton's shimmer attribute can be
       baked in. */
    var pristine = tpl.cloneNode(true);
    pristine.removeAttribute("data-product-skeleton");
    all("[data-product-skeleton]", pristine).forEach(function (el) {
      el.removeAttribute("data-product-skeleton");
    });
    /* Clean at the SOURCE as well as per clone: the authored template is very
       likely mid-entrance-animation right now (we resolve during afterEnter),
       and a pristine copy that carries a frozen translateY would hand the same
       offset to every row this page ever renders. */
    pristine.style.display = "";
    clearInlineMotion(pristine);
    all("*", pristine).forEach(clearInlineMotion);
    if (tpl.parentNode) tpl.parentNode.removeChild(tpl);

    state.lists[name] = { box: box, tpl: pristine };
    return state.lists[name];
  }

  function hideTemplate(tpl) {
    if (!tpl) return;
    tpl.style.display = "none";
    tpl.setAttribute("data-product-template-hidden", "");
    tpl.setAttribute("aria-hidden", "true");
  }

  function clearList(box) {
    all("[data-product-list-item]", box).forEach(function (node) {
      if (window.LiquidGlass && typeof window.LiquidGlass.kill === "function") {
        try {
          window.LiquidGlass.kill(node);
        } catch (e) {}
      }
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function renderList(name, box, tpl, items) {
    if (!tpl) {
      console.warn(
        '[product] [data-product-list="' +
          box.getAttribute("data-product-list") +
          '"] has no [data-product-list-template] inside it — nothing to ' +
          "clone. Build ONE item inside the container and put the template " +
          "attribute on it."
      );
      return false;
    }
    clearList(box);

    items.forEach(function (html) {
      var clone = tpl.cloneNode(true);
      clone.removeAttribute("data-product-list-template");
      /* The template is hidden by attribute (display:none!important), and a
         clone of it inherits that attribute — which hid every row, not just the
         template. Strip it, and the aria-hidden that goes with it. */
      clone.removeAttribute("data-product-template-hidden");
      clone.removeAttribute("aria-hidden");
      /* Also the list attribute: in the swapped-attributes case the template
         IS the element carrying it, and a clone that kept it would be found by
         the next paint's resolveList() instead of the real container. */
      clone.removeAttribute("data-product-list");
      clone.removeAttribute("data-product-skeleton");
      clone.setAttribute("data-product-list-item", "");
      clone.style.display = "";
      var textEl = clone.querySelector("[data-product-list-text]") || clone;
      textEl.innerHTML = interpolate(html);
      // Root AND descendants — the entrance attribute is usually on the text
      // element inside the row, not on the row.
      unhide(clone);
      box.appendChild(clone);
    });

    // Attach glass to the fresh clones, if the item uses it.
    if (window.LiquidGlass && typeof window.LiquidGlass.scan === "function") {
      try {
        window.LiquidGlass.scan(box);
      } catch (e) {}
    }

    /* We built rows and none of them are on screen: something is hiding them
       that this function didn't put there. Say so loudly — a silently empty
       card is the one failure mode that looks like "the copy didn't load" and
       sends you hunting in the wrong place. */
    var first = one("[data-product-list-item]", box);
    if (first && window.getComputedStyle) {
      var cs = getComputedStyle(first);
      if (cs.display === "none" || cs.visibility === "hidden")
        console.warn(
          "[product] rendered " +
            items.length +
            " rows for \"" +
            name +
            '" but they are not visible (display:' +
            cs.display +
            "; visibility:" +
            cs.visibility +
            "). Run Flexicare.product.debugList(\"" +
            name +
            '") and check what is hiding them.'
        );
    }
    return true;
  }

  /* ------------------------ in-place row cloning ------------------------ */

  /* The no-container fallback. A slot with several items landing on ONE
     element used to CYCLE through them, which is wrong for a list: the
     benefit lines are all meant to be on screen at once. So instead the
     element itself becomes the template — it is cloned in place, once per
     item, as siblings after itself.

     That means the plain build works with no wrapper: put the ID on the
     benefit row and you get five rows. Cycling is now opt-in
     (data-product-cycle-slot), because a slot that should rotate is the rare
     case and a list is the common one.

     ROWS vs TEXT. If the ID sits on the text element and the arrow glyph is a
     SIBLING, cloning the text alone gives you text without arrows. Mark the
     row with [data-product-row] and that ancestor is what gets cloned, with
     the copy written into the ID'd descendant inside each clone. */
  function rowFor(el) {
    var row = el.closest && el.closest("[data-product-row]");
    return row || el;
  }

  function clearClones(name, parent) {
    all('[data-product-clone="' + name + '"]', parent).forEach(function (node) {
      if (window.LiquidGlass && typeof window.LiquidGlass.kill === "function") {
        try {
          window.LiquidGlass.kill(node);
        } catch (e) {}
      }
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function renderInPlace(name, el, items) {
    var row = rowFor(el);
    var host = row.parentNode;
    if (!host) return false;

    clearClones(name, host);

    // The original keeps the ID and gets item 0. It is authored content, so it
    // may carry the entrance attributes itself.
    el.innerHTML = interpolate(items[0]);
    show(row, true);
    unhide(row);

    var last = row;
    for (var i = 1; i < items.length; i++) {
      var clone = row.cloneNode(true);
      /* Duplicate IDs are invalid and would break copyTargets() on the next
         paint (it would find several elements for one slot and switch to the
         one-item-per-element branch). Strip them from the clone; the ID lives
         on the original only. */
      var idHolder =
        row === el ? clone : clone.querySelector('[id="' + name + '"]');
      if (clone.id) clone.removeAttribute("id");
      if (idHolder && idHolder !== clone) idHolder.removeAttribute("id");
      clone.setAttribute("data-product-clone", name);
      clone.style.display = "";
      (idHolder || clone).innerHTML = interpolate(items[i]);
      unhide(clone);
      host.insertBefore(clone, last.nextSibling);
      last = clone;
    }

    if (window.LiquidGlass && typeof window.LiquidGlass.scan === "function") {
      try {
        window.LiquidGlass.scan(host);
      } catch (e) {}
    }
    return true;
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
      /* A [data-product-list] container wins: ONE authored item, cloned per
         entry. That is the path for the benefit lines, and the only one that
         handles a list whose length changes per archetype/product. */
      var list = resolveList(name);
      if (list) {
        if (renderList(name, list.box, list.tpl, items)) return;
      }

      var targets = copyTargets(name);
      if (!targets.length) {
        dbg('slot "' + name + '" has copy but no element or list for it');
        return;
      }
      // No list container: several items across several elements = one item
      // per element, in order.
      if (items.length > 1 && targets.length > 1) {
        targets.forEach(function (el, i) {
          if (i < items.length) el.innerHTML = interpolate(items[i]);
          else show(el, false); // more slots than copy — hide the leftovers
        });
        return;
      }

      /* Several items, ONE element. Default: clone the element per item so all
         of them are on screen together (a list). Cycling is opt-in, because a
         rotating slot is the exception — before this, every multi-item slot
         silently animated one line at a time. */
      if (items.length > 1 && targets.length === 1) {
        var solo = targets[0];
        if (solo.hasAttribute("data-product-cycle-slot")) {
          solo.innerHTML = interpolate(items[0]);
          state.cycles.push({ el: solo, items: items });
        } else if (!renderInPlace(name, solo, items)) {
          solo.innerHTML = interpolate(items[0]); // detached — best effort
        }
        return;
      }

      targets.forEach(function (el) {
        el.innerHTML = interpolate(items[0]);
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

  /* OPT-IN, via data-product-cycle-slot on the element. Multi-item slots
     default to being LISTED (all items on screen at once) — cycling one line
     at a time is right for a rotating strapline and wrong for a set of
     benefits. All cycling slots share ONE timer so they change together. */
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
        swapText(c.el, interpolate(c.items[state.cycleIndex % c.items.length]));
      });
    }, state.cycleMs);
  }

  /* --------------------------- API-driven copy --------------------------- */

  function havePrice() {
    var c = state.result && state.result.recommended_price_cents;
    return typeof c === "number" && !isNaN(c);
  }

  // Just the number: "249". "" when the API returned no price.
  function amountText() {
    if (!havePrice()) return "";
    var decimals = parseInt(
      attr(state.wrap, "data-product-price-decimals", "0"),
      10
    );
    if (isNaN(decimals) || decimals < 0) decimals = 0;
    var amount = (state.result.recommended_price_cents / 100).toFixed(decimals);
    // Thousands separators, without Intl (this has to run on old Android too).
    var bits = amount.split(".");
    bits[0] = bits[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return bits.join(".");
  }

  // The whole line: "From R249/month". fmtEl lets one element override the
  // wrapper's format, so a card and a sticky bar can word it differently.
  function priceText(fmtEl) {
    if (!havePrice()) return "";
    var fmt =
      attr(fmtEl, "data-product-price-format", null) ||
      attr(state.wrap, "data-product-price-format", "From R{amount}/month");
    return fmt.replace(/\{amount\}/g, amountText());
  }

  function paintResult(r) {
    // [data-product-name] is the standalone slot; copy that says "…, {name}."
    // inline is handled by interpolate() instead. Both work; use whichever
    // suits the sentence.
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
    var priced = havePrice();
    slots("[data-product-price]").forEach(function (el) {
      if (priced) el.textContent = priceText(el);
      show(el, priced);
    });
    slots("[data-product-price-wrap]").forEach(function (el) {
      show(el, priced);
    });
    if (!priced)
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
    /* The authored template row must NOT be on screen once its clones are in.
       An inline display:none is the obvious way to do that, but it loses to any
       Webflow class carrying !important — and a template left visible reads as
       a real (empty) row, which is exactly the "one extra row, text shifted
       down by one" symptom. So hide it by attribute, with !important of our
       own. */
    "[data-product-template-hidden]{display:none!important}" +
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
      targets = targets.concat(
        all('[id="' + name + '"],[data-product-slot="' + name + '"]', wrap)
      );
    });
    /* The authored list template is the only list item on screen until the
       clones land, so it is what has to shimmer. Mark its TEXT slot, not the
       item — the item usually carries the arrow glyph and the row layout, and
       shimmering the whole row hides the arrow and squashes the spacing. */
    all("[data-product-list-template]", wrap).forEach(function (tpl) {
      var textEl = tpl.querySelector("[data-product-list-text]") || tpl;
      skeletonOn(textEl);
    });
    targets.forEach(skeletonOn);
  }

  function clearSkeleton() {
    all("[data-product-skeleton]").forEach(function (el) {
      el.removeAttribute("data-product-skeleton");
    });
    /* A list whose slot had no copy never went through renderList(), so its
       authored template is still sitting there as a placeholder row — a lone
       lorem-ipsum bullet reads as real content. REMOVE it rather than hide it,
       for the same reason resolveList() detaches: hiding kept losing to the
       page's own CSS. */
    all("[data-product-list]").forEach(function (box) {
      if (one("[data-product-list-item]", box)) return; // rendered fine
      var tpl = one("[data-product-list-template]", box);
      if (!tpl) return;
      hideTemplate(tpl); // in case anything still holds a reference to it
      if (tpl.parentNode) tpl.parentNode.removeChild(tpl);
    });
    if (state.wrap) state.wrap.setAttribute("data-product-state", "ready");
  }

  /* --------------------------- navigation --------------------------- */

  function nextUrl() {
    /* The default CTA target is the prize wheel, and the wheel is KIOSK-ONLY:
       POST /spin on a WEB session is a hard 409. So a web visitor sent to
       /spin-to-win gets a page that can only ever show its fallback copy.
       data-product-next-web is the escape hatch — set it and web traffic
       skips the spin page entirely, while the tablets still go to it.

       Unset, behaviour is unchanged (everyone goes to data-product-next and
       the spin page explains itself), which is the right default while the
       site is web-only and no tablet has been paired yet. */
    /* ...unless ?demo is armed. The whole point of the journey-wide demo flag
       is to reach the wheel WITHOUT a paired tablet, and this escape hatch
       would route the one visitor who asked for it straight past the page
       they were trying to see. FC.spin is defined by flexicare-spin.js, which
       loads after this file — fine, because nextUrl() runs at click time. */
    var demoing = !!(FC.spin && FC.spin.demo && FC.spin.demo());
    if (demoing) dbg("?demo is armed — ignoring data-product-next-web");

    if (
      !demoing &&
      FC.kiosk &&
      typeof FC.kiosk.isKiosk === "function" &&
      !FC.kiosk.isKiosk()
    ) {
      var webUrl = attr(state.wrap, "data-product-next-web", null);
      if (webUrl) {
        dbg("web session — CTA goes to data-product-next-web:", webUrl);
        return webUrl;
      }
    }

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
    state.result = null;
    state.lists = {}; // fresh container = fresh authored templates
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
        state.result = r; // before any paint — interpolate() reads it
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
    state.result = null;
    state.lists = {};
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

  /* Flexicare.product.debugList("plan-benefit") — print what actually got
     built for a list slot. Answers, in one line, the questions that otherwise
     take a round of screenshots: which element is the container, which is the
     template, whether the template is still visible, how many rows are on
     screen, and what text and icons each row ended up with. */
  function debugList(name) {
    name = name || "plan-benefit";
    var list = resolveList(name);
    if (!list) {
      console.log(
        '[product] no [data-product-list="' + name + '"] on this page.'
      );
      return;
    }
    function describe(el) {
      if (!el) return "(none)";
      var out = el.tagName.toLowerCase();
      if (el.id) out += "#" + el.id;
      if (el.className && typeof el.className === "string" && el.className.trim())
        out += "." + el.className.trim().split(/\s+/).join(".");
      return out;
    }
    function visible(el) {
      if (!el) return false;
      var cs = window.getComputedStyle ? getComputedStyle(el) : null;
      return !!cs && cs.display !== "none" && cs.visibility !== "hidden";
    }
    console.log("[product] list:", name);
    console.log("  container:", describe(list.box));
    console.log(
      "  template :",
      describe(list.tpl),
      !list.tpl
        ? "MISSING"
        : attached(list.tpl)
        ? visible(list.tpl)
          ? "*** STILL IN THE DOM AND VISIBLE ***"
          : "in the DOM but hidden"
        : "detached (ok)"
    );
    var rows = all("[data-product-list-item]", list.box);
    console.log("  clones   :", rows.length);
    // Every direct child of the container, in order — the template included,
    // so an off-by-one row shows up as an unexpected entry in this list.
    var kids = Array.prototype.slice.call(list.box.children);
    kids.forEach(function (kid, i) {
      var txt = kid.querySelector("[data-product-list-text]") || kid;
      /* Geometry, because "the DOM is right but it looks shifted" is a real
         and separate failure: a clone taken mid-entrance-tween keeps an inline
         transform, so the text sits offset from its own row while the icon
         beside it stays put. dy is that offset — it should be ~0. */
      var rowTop = kid.getBoundingClientRect().top;
      var txtTop = txt.getBoundingClientRect().top;
      console.log(
        "   " + i + ".",
        describe(kid),
        visible(kid) ? "visible" : "HIDDEN",
        kid.hasAttribute("data-product-list-item") ? "[clone]" : "[authored]",
        "dy=" + Math.round(txtTop - rowTop),
        "transform=" + (txt.style.transform || "none"),
        "text=" + JSON.stringify((txt.textContent || "").trim().slice(0, 34))
      );
    });
  }

  FC.product = {
    init: init,
    teardown: teardown,
    debugList: debugList,
    // Flexicare.product.copy("A", "PLUS") — inspect the resolved database
    copy: collectCopy,
    skeleton: markSkeleton,
  };
})();
