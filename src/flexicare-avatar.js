/* ============================================================
   Flexicare Avatar v1 — "Pick the one that looks most like you"
   the avatar-picker page (the alternative to the selfie)
   ------------------------------------------------------------
   Plain JS (ES5-style). Load AFTER flexicare-core.js and @barba/core
   (order relative to the other page controllers doesn't matter — this
   only depends on the core).

   WHAT THIS PAGE DOES
     The route for users who don't want to be photographed. It is a
     sibling of the selfie page, not a step after it: the user reaches it
     from a link on the selfie page, picks a face, and continues to
     /onboarding exactly as the selfie path does.

       1. Two filter rows — gender (2) and race (5) — drive
          GET /avatars?race=…&gender=… which ALWAYS returns 9 avatars
          (3 age groups x 3 variants), already ordered
          young_adult → middle_aged → elder. Rendered as a 3x3 grid by
          cloning one template card.
       2. Tapping a card buffers the choice on Flexicare.avatar
          (IN MEMORY, like the selfie Blob) — the avatar can't be sent
          yet, because PATCH …/photo/avatar needs a session id and the
          session isn't created until /onboarding submits.
       3. /onboarding does the send: after POST /sessions it calls
          PATCH /sessions/{id}/photo/avatar { avatar_id }. NOTHING IS
          GENERATED on this path (api-contract §3.8): every catalog
          avatar already has an admin-approved with/without-cover pair
          stored against it, and selecting the avatar copies that pair
          onto the session. So GET /sessions/{id}/images comes back
          READY on the FIRST call — an avatar user never sees the
          reveal page's "developing…" state, and there is no FAILED to
          design for. Downstream code is unchanged: the reveal page
          polls the same endpoint either way and doesn't know or care
          which path produced the pair (the shared polling code just
          resolves immediately).
       4. The gender chosen here is remembered (Flexicare.avatarGender)
          and pre-fills the gender pills on /onboarding, so the user
          isn't asked the same thing twice. It stays editable there, and
          /onboarding remains the authority for the session's `gender`.

     Selfie and avatar are MUTUALLY EXCLUSIVE — the core clears the
     buffered selfie when an avatar is picked and vice versa, so whichever
     the user did last is what gets sent.

   WHY THE CATALOG IS RE-FETCHED EVERY TIME
     The `url` on each avatar is presigned and expires in ~10 minutes, so
     we never cache it: the grid is re-fetched on every entry to the page
     and on every filter change. Only the chosen avatar's ID is kept
     (an ID doesn't expire); if the user comes back to the page, the
     selection is restored by ID once the fresh catalog lands.

   NOT EVERY SLOT HAS AN IMAGE
     The catalog is curated by admins, so a slot can come back with
     `url: null`. Those cards get data-avatar-unavailable + the
     is-unavailable class and are NOT selectable — style them as a
     placeholder.
     THE GATE IS `url`, NOT `status` (api-contract §3.7: "selectable <=>
     url present"). A url is only issued once the avatar image AND its two
     approved scenario images are all ready, so it is the stricter signal;
     `status` describes the avatar image alone and can say READY for a slot
     that still has no url. We show `status` in the debug table and gate on
     `url`.

   CONVENTIONS (mirror flexicare-quiz.js / flexicare-onboarding.js)
     • Inits on Barba `afterEnter` (after transition.js's syncRegions() +
       LiquidGlass.scan() have settled the nav buttons / glass).
     • ONE delegated document click listener, re-resolving targets by
       attribute at click time — immune to glass rebuilds and hook timing.
     • barba.go() navigation only (a reload would drop the buffer).
     • Teardown on beforeLeave + pagehide; a run token invalidates
       in-flight fetches so a fast navigation can't paint into the next
       page's DOM.

   ------------------------------------------------------------
   WEBFLOW ATTRIBUTE CONTRACT
     [data-avatar]             REQUIRED. Wrapper/marker for the page — gates
                              init. May BE the Barba container. Config
                              attributes on it (note the -url / -default
                              suffixes: they keep the wrapper from being
                              matched by the button/pill queries below):
                                data-avatar-next-url="/onboarding"
                                   where the Next button goes (default
                                   "/onboarding"). The button's own value or
                                   href wins over this.
                                data-avatar-back-url="/selfie"
                                   where Back goes; omit → history.back()
                                data-avatar-gender-default="male"
                                data-avatar-race-default="black"
                                   which pills start selected (defaults
                                   "male" / "black"). On re-entry the user's
                                   previous choice wins over these.
                                data-avatar-debug   console logging, including a
                                   per-slot table of what the API returned
                                   (slot / slug / status / image) after every
                                   load. Flexicare.avatarPicker.report() prints
                                   the same table on demand, any time.

     Filters (plain Webflow divs, or the tab-links of a Tabs component — one
     element per option. NOTE: don't rely on Webflow's own Tabs JS here. It
     binds once on DOMContentLoaded, so after a Barba navigation it is dead:
     panes stop switching and `w--current` stops moving. Style the selected
     state on `is-selected` — which this script toggles — and the pills behave
     the same however the user arrived. Gender and race are independent
     filters, so keep the two rows as siblings; nesting one Tabs component
     inside the other's pane means duplicating the inner menu per pane and
     relying on exactly the pane-switching that doesn't survive a swap.):
     [data-avatar-gender="male"|"female"]     REQUIRED. The two gender pills.
     [data-avatar-race="white|coloured|black|indian|asian"]
                              REQUIRED. The five race pills. THE VALUE IS THE
                              API ENUM, not the label — the design's "Mixed"
                              pill carries data-avatar-race="coloured". Type
                              whatever label you like in the Designer; only
                              the attribute value is sent.
                              Valid values (AvatarRace): black, white,
                              indian, asian, coloured.
                              The selected pill of each row gets class
                              `is-selected` + aria-pressed; override per
                              element with data-selected-class="YourCombo".

     The grid — TWO ways to build it. Authored cards win if both are present.
     [data-avatar-grid]       The container the cards live in. MAY APPEAR MORE
                              THAN ONCE — if your layout builds the 3x3 as three
                              flex rows, put it on each row. Slot cards are
                              collected from the whole [data-avatar] wrapper, so
                              their nesting doesn't matter (in static mode the
                              attribute is optional; clone mode needs one, as
                              the place to append to).

     (A) STATIC / AUTHORED CARDS — the normal path:
     [data-avatar-slot="1"…"9"]
                              NINE cards you place and style individually in the
                              Designer, numbered in READING ORDER. The API always
                              returns exactly 9 avatars in a fixed order —
                              young_adult 1-2-3, middle_aged 1-2-3, elder 1-2-3 —
                              so slot 1 is top-left and slot 9 is bottom-right.
                              The cards are filled IN PLACE and never removed, so
                              your layout, classes and glass are untouched; only
                              the image and the state attributes change when the
                              filters change. Each card also gets, at fill time,
                              data-avatar-option, data-avatar-id, -slug,
                              data-age-group and data-variant (handy for CSS).
                              Because the race/gender filters say which SET is
                              loaded, the card needs no race/gender in its
                              attribute — one attribute name covers all 10 sets.
                              WHATEVER IMAGE YOU SET IN THE DESIGNER STAYS as
                              that slot's placeholder: a slot the backend hasn't
                              populated yet is never overwritten, it only gets
                              is-unavailable. So a distinct placeholder per slot
                              shows at a glance which faces are still missing
                              from the catalog. Fewer than 9 cards logs a
                              console warning naming the count.
     (B) TEMPLATE / CLONE — use when you'd rather author one card:
     [data-avatar-option-template]
                              ONE card INSIDE the grid, cloned 9x. Clones inherit
                              everything on it, including data-liquid-glass (they
                              are scanned by glass on render). Only used when
                              there are NO [data-avatar-slot] cards.

     [data-avatar-image]      Optional, INSIDE each card (or the template). The
                              <img> the avatar is written into (we set src, and
                              drop Webflow's srcset). If absent, the card itself
                              gets a background-image. Gets class `is-loaded`
                              once the file has decoded, so you can fade it in
                              from CSS (removed and re-added on each refill).
     Selected card: class `is-selected` (a Webflow COMBO class on the card
     works exactly right — combos are just two classes; override the name per
     card with data-selected-class) + aria-pressed="true". The little dot in the
     corner is yours — put it in the card and show it from
     `.is-selected [data-avatar-check]`, or style however you like.
     Unavailable card: data-avatar-unavailable + class `is-unavailable` +
     aria-disabled="true" (not clickable).

     LOADING / SKELETON (the shimmer — all optional, all CSS-driven):
     data-avatar-state="loading"
                              on the wrapper while the catalog is in flight.
                              SET IT IN THE DESIGNER TOO (a static attribute on
                              [data-avatar]): the script only stamps it once it
                              runs, so on a hard load the authored placeholder
                              cards would otherwise flash first. JS clears it.
     data-avatar-card-state="loading|ready|unavailable"
                              stamped on EVERY card. A card stays "loading"
                              until ITS OWN image has decoded, so the shimmer
                              covers the Designer placeholder for exactly as
                              long as there's nothing real to show, then flips
                              to "ready" (or "unavailable" for a slot the
                              catalog hasn't populated).
     class `is-loading`       added to each card AND to the filter pills and the
                              Next/Back buttons while loading (plus aria-busy).
                              Override the name per element with
                              data-loading-class="YourCombo". Pills stay
                              clickable while busy — switching filters mid-load
                              is fine.
     THE SHIMMER CSS IS BUILT IN — the script injects it into the persistent
                              head on first entry, because Barba never swaps the
                              <head>: CSS pasted into a PAGE's Custom Code only
                              exists on a hard load, so a barba.go() arrival
                              would have no shimmer at all until you reloaded.
                              Tune it with CSS variables on [data-avatar]
                              (--fc-skeleton-bg / -sheen / -speed / -fade), or
                              override any rule from the SITE head — the injected
                              selectors are :where()-wrapped, so they carry zero
                              specificity and yours always wins. Opt out entirely
                              with data-avatar-skeleton="off" on the wrapper.
                              Details + the full stylesheet:
                              docs/avatar-loading-state.md.

     States / messages (all optional):
     [data-avatar-loading]    shown while the catalog is being fetched
     [data-avatar-empty]      shown when a race/gender combo has no selectable
                              avatars at all ("none ready yet — try another")
     [data-avatar-error]      API errors surface into this element
     The wrapper also carries data-avatar-state="loading|ready|empty|error"
     so you can drive all of the above purely from CSS if you prefer.

     Buttons (delegated — they live in the PERSISTENT nav bar, outside the
     Barba container; that's fine, clicks are delegated):
     [data-avatar-next]       REQUIRED. The "Next" button. Gets class
                              `is-disabled` + aria-disabled while nothing is
                              selected; it stays clickable (tapping it then
                              surfaces the "pick one" message rather than
                              navigating). Its value or href overrides
                              data-avatar-next-url.
     [data-avatar-back]       Optional. "Back". Value → that URL; empty →
                              history.back().

   GETTING HERE FROM THE SELFIE PAGE
     Just a normal Webflow link to this page — no attribute needed. Barba
     handles it, and the selfie controller's beforeLeave stops the camera.

   PROGRESS BAR (owned by transition.js): set data-progress="0.25" (or
   whatever this step is worth) on this page's Barba container.
   GLASS: on any glass card/pill use data-anim-fade, never data-anim.
   ============================================================ */
(function () {
  "use strict";

  if (!window.Flexicare) {
    console.warn("[avatar] flexicare-core.js must load first.");
    return;
  }
  var FC = window.Flexicare;

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // AvatarRace / AvatarGender (api-contract.md §3.7). Anything else → 422.
  var RACES = ["black", "white", "indian", "asian", "coloured"];
  var GENDERS = ["male", "female"];

  var state = {
    wrap: null,
    grid: null,
    mode: "slot", // "slot" (authored cards) | "clone" (one template) — see init()
    gender: null,
    race: null,
    avatars: [], // last catalog response
    token: 0, // bumped on init/teardown/refetch; async work checks it
    fetchTimer: null,
  };

  function dbg() {
    if (
      window.console &&
      (window.FLEXICARE_DEBUG ||
        (state.wrap && state.wrap.hasAttribute("data-avatar-debug")))
    ) {
      console.log.apply(console, ["[avatar]"].concat([].slice.call(arguments)));
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
  function realHref(el) {
    // Webflow gives Link Blocks a default href="#" — not a destination.
    var h = el && el.getAttribute && el.getAttribute("href");
    return h && h !== "#" ? h : null;
  }
  function go(url) {
    if (!url) return;
    if (window.barba && typeof window.barba.go === "function")
      window.barba.go(url);
    else window.location.href = url; // NOTE: a reload drops the buffered choice
  }
  function alive(token) {
    return token === state.token && !!state.wrap;
  }
  function show(el, on) {
    if (el) el.style.display = on ? "" : "none";
  }
  function inList(list, v) {
    return list.indexOf(String(v || "").toLowerCase()) !== -1;
  }

  /* --------------------------- loading marks --------------------------- */

  /* The skeleton/shimmer plumbing. Nothing here paints anything — it only
     stamps attributes + a class, so the whole look is authored in Webflow
     (a shimmer gradient, a flat grey block, whatever). Three levels:

       wrapper   data-avatar-state="loading"        (already existed)
       card      data-avatar-card-state="loading|ready|unavailable"
                 + class is-loading (override per card: data-loading-class)
                 + aria-busy
       controls  the same class/aria-busy on the filter pills and the
                 Next/Back buttons

     A card stays in "loading" until ITS OWN image has decoded, so the
     shimmer covers the Designer placeholder for exactly as long as there is
     nothing real to show. Stamped early (see prime() on beforeEnter) so the
     placeholder cards never flash before the fetch even starts. */

  /* THE SKELETON CSS SHIPS WITH THE SCRIPT, and it has to.
     Barba only swaps the container — the <head> never changes — so anything
     pasted into a PAGE's Custom Code exists on a hard load and is missing on
     every barba.go() arrival. That's why the shimmer "only worked after a
     reload". Injected here (once, into the persistent head, flagged
     data-js-injected so transition.js's shell sync leaves it alone).

     Everything is authored to be easy to override from Webflow:
       • selectors are wrapped in :where() → ZERO specificity, so any rule you
         write in the site head wins without !important;
       • the colours/speed are CSS custom properties you can redefine on
         [data-avatar] (or :root) in the Designer;
       • set data-avatar-skeleton="off" on the wrapper to skip the inject
         entirely and style it all yourself. */
  var SKELETON_CSS =
    "@keyframes fc-avatar-shimmer{from{background-position:-150% 0}to{background-position:250% 0}}" +
    ":where([data-avatar]){--fc-skeleton-bg:rgba(255,255,255,.06);--fc-skeleton-sheen:rgba(255,255,255,.18);--fc-skeleton-speed:1.5s;--fc-skeleton-fade:.35s}" +
    ':where([data-avatar-state="loading"] [data-avatar-slot],[data-avatar-card-state="loading"]){position:relative;overflow:hidden;background-color:var(--fc-skeleton-bg,rgba(255,255,255,.06))}' +
    ':where([data-avatar-state="loading"] [data-avatar-slot],[data-avatar-card-state="loading"])::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:2;background-image:linear-gradient(100deg,rgba(255,255,255,0) 20%,var(--fc-skeleton-sheen,rgba(255,255,255,.18)) 50%,rgba(255,255,255,0) 80%);background-size:200% 100%;background-repeat:no-repeat;animation:fc-avatar-shimmer var(--fc-skeleton-speed,1.5s) linear infinite}' +
    ':where([data-avatar-state="loading"] [data-avatar-slot] [data-avatar-image],[data-avatar-card-state="loading"] [data-avatar-image]){opacity:0}' +
    ":where([data-avatar-image]){transition:opacity var(--fc-skeleton-fade,.35s) ease}" +
    ':where([data-avatar-card-state="ready"] [data-avatar-image].is-loaded){opacity:1}' +
    ':where([data-avatar-card-state="unavailable"],[data-avatar-unavailable]){opacity:.35;pointer-events:none}' +
    ":where([data-avatar-gender].is-loading,[data-avatar-race].is-loading){opacity:.55;transition:opacity .2s ease}" +
    ":where([data-avatar-next].is-loading,[data-avatar-back].is-loading){opacity:.45;transition:opacity .2s ease}" +
    '@media (prefers-reduced-motion:reduce){:where([data-avatar-state="loading"] [data-avatar-slot],[data-avatar-card-state="loading"])::after{animation:none}}';

  var cssDone = false;
  function injectCSS(wrap) {
    if (cssDone) return;
    if (wrap && attr(wrap, "data-avatar-skeleton", "") === "off") {
      cssDone = true; // opt-out: the page styles the skeleton itself
      return;
    }
    if (document.querySelector("style[data-avatar-skeleton-css]")) {
      cssDone = true;
      return;
    }
    var el = document.createElement("style");
    el.setAttribute("data-avatar-skeleton-css", "");
    el.setAttribute("data-js-injected", ""); // shell sync must skip it
    el.textContent = SKELETON_CSS;
    document.head.appendChild(el);
    cssDone = true;
  }

  function markBusy(el, on) {
    if (!el) return;
    var cls = attr(el, "data-loading-class", "is-loading");
    if (el.classList) el.classList.toggle(cls, !!on);
    if (on) el.setAttribute("aria-busy", "true");
    else el.removeAttribute("aria-busy");
  }

  // Cards to skeleton: the authored slot cards, else the clone template +
  // whatever clones are currently on screen.
  function loadingCards(root) {
    var cards = all("[data-avatar-slot]", root);
    if (!cards.length)
      cards = all(
        "[data-avatar-option-template],[data-avatar-option]",
        root
      );
    return cards;
  }

  function setCardLoading(card, on) {
    if (!card) return;
    markBusy(card, on);
    if (on) {
      card.setAttribute("data-avatar-card-state", "loading");
      var img = one("[data-avatar-image]", card);
      if (img && img.classList) img.classList.remove("is-loaded");
    }
  }

  function setCardsLoading(on, root) {
    loadingCards(root || state.wrap || document).forEach(function (card) {
      setCardLoading(card, on);
    });
  }

  // The pills live inside the container; Next/Back live in the persistent nav
  // OUTSIDE it, so they are always looked up from the document.
  function setControlsLoading(on, root) {
    var scope = root || state.wrap || document;
    all("[data-avatar-gender],[data-avatar-race]", scope).forEach(function (el) {
      markBusy(el, on);
    });
    all("[data-avatar-next],[data-avatar-back]").forEach(function (el) {
      markBusy(el, on);
    });
  }

  /* --------------------------- state plumbing --------------------------- */

  function setPageState(s) {
    if (state.wrap) state.wrap.setAttribute("data-avatar-state", s);
    show(one("[data-avatar-loading]"), s === "loading");
    show(one("[data-avatar-empty]"), s === "empty");
    if (s !== "loading") setControlsLoading(false);
  }

  function showError(msg) {
    var el = one("[data-avatar-error]");
    if (el) {
      el.textContent = msg;
      el.style.display = "";
    } else if (window.console) {
      console.warn("[avatar] " + msg);
    }
  }
  function clearError() {
    var el = one("[data-avatar-error]");
    if (el) el.style.display = "none";
  }

  function selectedId() {
    return FC.avatar && FC.avatar.id ? FC.avatar.id : null;
  }

  function setNextEnabled(on) {
    all("[data-avatar-next]").forEach(function (btn) {
      if (btn.classList) btn.classList.toggle("is-disabled", !on);
      if (on) btn.removeAttribute("aria-disabled");
      else btn.setAttribute("aria-disabled", "true");
      // Dimmed default (opacity is transform-safe re: glass); override via
      // the .is-disabled class if you want a different look.
      btn.style.opacity = on ? "" : "0.45";
    });
  }

  /* ---------------------------- filter pills ---------------------------- */

  function reflectPills() {
    all("[data-avatar-gender]").forEach(function (el) {
      var on = attr(el, "data-avatar-gender", "") === state.gender;
      var cls = attr(el, "data-selected-class", "is-selected");
      if (el.classList) el.classList.toggle(cls, on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
    all("[data-avatar-race]").forEach(function (el) {
      var on = attr(el, "data-avatar-race", "") === state.race;
      var cls = attr(el, "data-selected-class", "is-selected");
      if (el.classList) el.classList.toggle(cls, on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* ------------------------------- the grid ------------------------------- */

  // <img> → src; anything else → background-image. Decodes first so the swap
  // never shows a half-painted frame, then flags is-loaded for the CSS fade.
  function paintImage(el, url, token, done) {
    if (!el || !url) {
      if (done) done();
      return;
    }
    var pre = new Image();
    pre.onload = function () {
      if (!alive(token) || !el.parentNode) return;
      if (done) done(); // drop the skeleton the instant there's a face to show
      if (el.tagName === "IMG") {
        el.removeAttribute("srcset"); // Webflow adds one; it would win over src
        el.src = url;
      } else {
        el.style.backgroundImage = 'url("' + url + '")';
      }
      if (el.classList) el.classList.add("is-loaded");
      if (!reduceMotion && window.gsap)
        window.gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.35 });
    };
    pre.onerror = function () {
      dbg("avatar image failed to load", url);
      if (!alive(token)) return;
      if (done) done(); // never leave a card shimmering forever
    };
    pre.src = url;
  }

  // Only ever removes CLONES. Authored slot cards (static mode) are the user's
  // Webflow markup — they get reset in place, never deleted.
  function clearGrid() {
    if (!state.wrap || state.mode !== "clone") return;
    all("[data-avatar-option]", state.wrap).forEach(function (node) {
      if (node.hasAttribute("data-avatar-slot")) return; // authored, not ours
      if (window.LiquidGlass && typeof window.LiquidGlass.kill === "function") {
        try {
          window.LiquidGlass.kill(node);
        } catch (e) {}
      }
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  }

  // The authored cards, in slot order. Collected from the WHOLE page wrapper,
  // not from one container — the layout may well split the 3x3 into three flex
  // rows, each with its own [data-avatar-grid]. Numeric sort, so slot 10+ (if
  // you ever grow the grid) doesn't land between 1 and 2.
  function slotCards() {
    var cards = all("[data-avatar-slot]", state.wrap || document);
    return cards.sort(function (a, b) {
      return (
        (parseFloat(attr(a, "data-avatar-slot", 0)) || 0) -
        (parseFloat(attr(b, "data-avatar-slot", 0)) || 0)
      );
    });
  }

  // Console breakdown of what the backend actually returned, slot by slot — the
  // quick way to tell "the page is broken" from "that avatar isn't in the
  // catalog yet". Call Flexicare.avatarPicker.report() from the console.
  function report() {
    if (!window.console) return;
    var rows = slotCards().map(function (card, i) {
      var av = state.avatars[i] || null;
      return {
        slot: attr(card, "data-avatar-slot", i + 1),
        slug: (av && av.slug) || "—",
        status: (av && av.status) || "no data",
        image: av && av.url ? "yes" : "NO",
      };
    });
    console.log(
      "[avatar] " +
        state.race +
        " / " +
        state.gender +
        " — " +
        rows.length +
        " slot cards, " +
        state.avatars.length +
        " avatars returned"
    );
    if (console.table) console.table(rows);
    else
      rows.forEach(function (r) {
        console.log(r);
      });
    return rows;
  }

  // Write one avatar (or nothing) into one authored card. Everything the click
  // handler and the selection code need is stamped on here, so from that point
  // on a slot card and a clone are indistinguishable.
  function fillCard(card, av, chosen, token) {
    // SELECTABLE <=> `url` PRESENT (api-contract §3.7). Not `status` — a url is
    // only issued when the avatar AND its two approved scenario images are all
    // ready, so it is the stricter, authoritative signal. `status` describes the
    // avatar image alone and is kept for the debug table only.
    var ready = !!(av && av.url);
    var selCls = attr(card, "data-selected-class", "is-selected");
    var img = one("[data-avatar-image]", card) || card;

    card.setAttribute("data-avatar-option", ""); // makes it clickable/selectable
    card.setAttribute("data-avatar-id", (av && av.id) || "");
    if (av && av.age_group) card.setAttribute("data-age-group", av.age_group);
    else card.removeAttribute("data-age-group");
    if (av && av.variant) card.setAttribute("data-variant", av.variant);
    else card.removeAttribute("data-variant");
    if (av && av.slug) card.setAttribute("data-avatar-slug", av.slug);
    else card.removeAttribute("data-avatar-slug");

    var on = ready && !!chosen && chosen === av.id;
    if (card.classList) {
      card.classList.toggle(selCls, on);
      card.classList.toggle("is-unavailable", !ready);
    }
    card.setAttribute("aria-pressed", on ? "true" : "false");
    if (ready) {
      card.removeAttribute("data-avatar-unavailable");
      card.removeAttribute("aria-disabled");
      // Drop is-loaded first so the CSS fade re-runs for the incoming face.
      if (img.classList) img.classList.remove("is-loaded");
      // The card keeps its skeleton until this one image has decoded.
      setCardLoading(card, true);
      paintImage(img, av.url, token, function () {
        markBusy(card, false);
        card.setAttribute("data-avatar-card-state", "ready");
      });
    } else {
      // Curated catalog: this slot has no approved image yet (§3.7).
      card.setAttribute("data-avatar-unavailable", "");
      card.setAttribute("aria-disabled", "true");
      if (img.classList) img.classList.remove("is-loaded");
      // Nothing is coming for this slot — stop shimmering and let the
      // is-unavailable styling (and the Designer placeholder) show.
      markBusy(card, false);
      card.setAttribute("data-avatar-card-state", "unavailable");
    }
  }

  function renderGrid(avatars, token) {
    var chosenId = selectedId();

    /* ---- static mode: fill the authored slot cards (the normal path) ---- */
    if (state.mode === "slot") {
      var cards = slotCards();
      var filled = 0;
      cards.forEach(function (card, i) {
        var av = (avatars || [])[i] || null;
        fillCard(card, av, chosenId, token);
        if (av && av.url) filled++; // url present = selectable (§3.7)
      });
      if (cards.length < (avatars || []).length && window.console)
        console.warn(
          "[avatar] only " +
            cards.length +
            " [data-avatar-slot] cards found for " +
            (avatars || []).length +
            " avatars — the rest can't be shown. Check every card carries the" +
            " attribute (they may be split across several row wrappers)."
        );
      setPageState(filled ? "ready" : "empty");
      dbg("filled", cards.length, "slots,", filled, "with an image");
      if (
        window.FLEXICARE_DEBUG ||
        (state.wrap && state.wrap.hasAttribute("data-avatar-debug"))
      )
        report();
      return;
    }

    /* ---- clone mode: build the cards from one template ---- */
    var tpl = one("[data-avatar-option-template]", state.wrap);
    var grid = (tpl && tpl.parentNode) || state.grid;
    if (!tpl || !grid) {
      showError(
        "The avatar grid has no cards ([data-avatar-slot]) and no template."
      );
      return;
    }
    clearGrid();
    markBusy(tpl, false);
    tpl.style.display = "none";

    var chosen = chosenId;
    var selectable = 0;

    (avatars || []).forEach(function (av) {
      var ready = av && !!av.url; // url present = selectable (§3.7)
      if (ready) selectable++;

      var clone = tpl.cloneNode(true);
      clone.removeAttribute("data-avatar-option-template");
      clone.setAttribute("data-avatar-option", "");
      clone.setAttribute("data-avatar-id", (av && av.id) || "");
      if (av && av.age_group)
        clone.setAttribute("data-age-group", av.age_group);
      if (av && av.variant) clone.setAttribute("data-variant", av.variant);
      if (av && av.slug) clone.setAttribute("data-avatar-slug", av.slug);
      // The clone inherits any transition.js entrance attributes from the
      // template; strip them so the FOUC rule (opacity:0) can't leave clones
      // invisible when they're built after the page's entrance animation ran.
      clone.removeAttribute("data-anim");
      clone.removeAttribute("data-anim-fade");
      clone.removeAttribute("data-text-reveal");
      clone.style.display = "";

      var selCls = attr(clone, "data-selected-class", "is-selected");
      var on = ready && !!chosen && chosen === av.id;
      if (clone.classList) {
        clone.classList.toggle(selCls, on);
        clone.classList.toggle("is-unavailable", !ready);
      }
      clone.setAttribute("aria-pressed", on ? "true" : "false");
      if (!ready) {
        // Curated catalog: this slot has no approved image yet (§3.7).
        clone.setAttribute("data-avatar-unavailable", "");
        clone.setAttribute("aria-disabled", "true");
      }

      grid.appendChild(clone);
      if (ready) {
        setCardLoading(clone, true);
        paintImage(
          one("[data-avatar-image]", clone) || clone,
          av.url,
          token,
          function () {
            markBusy(clone, false);
            clone.setAttribute("data-avatar-card-state", "ready");
          }
        );
      } else {
        markBusy(clone, false);
        clone.setAttribute("data-avatar-card-state", "unavailable");
      }
    });

    // attach glass to freshly-injected clones (if they use it)
    if (window.LiquidGlass && typeof window.LiquidGlass.scan === "function") {
      try {
        window.LiquidGlass.scan(grid);
      } catch (e) {}
    }

    setPageState(selectable ? "ready" : "empty");
    dbg("rendered", (avatars || []).length, "cards,", selectable, "selectable");
  }

  /* ------------------------------ the fetch ------------------------------ */

  function fetchCatalog() {
    if (!state.wrap) return;
    if (!inList(RACES, state.race) || !inList(GENDERS, state.gender)) {
      showError("That combination isn't available.");
      setPageState("error");
      return;
    }
    var token = ++state.token;
    clearError();
    setPageState("loading");
    setCardsLoading(true);
    setControlsLoading(true);
    dbg("fetching", state.race, state.gender);

    FC.api("/avatars?race=" + state.race + "&gender=" + state.gender)
      .then(function (res) {
        if (!alive(token)) return;
        state.avatars = (res && res.avatars) || [];
        // The buffered choice may not be in this set (the user switched filters)
        // — drop it BEFORE rendering, so Next can never send an avatar that
        // isn't on screen.
        var chosen = selectedId();
        if (chosen) {
          var stillHere = false;
          state.avatars.forEach(function (av) {
            if (av && av.id === chosen) stillHere = true;
          });
          if (!stillHere) FC.clearAvatar();
        }
        renderGrid(state.avatars, token);
        setNextEnabled(!!selectedId());
      })
      .catch(function (err) {
        if (!alive(token)) return;
        state.avatars = [];
        // Blank the grid either way: remove the clones, or (static mode) reset
        // the authored cards so a failed reload can't leave the previous
        // filter's faces on screen looking selectable.
        if (state.mode === "slot")
          slotCards().forEach(function (card) {
            fillCard(card, null, null, token);
          });
        else clearGrid();
        setCardsLoading(false); // nothing is coming — stop the shimmer
        setPageState("error");
        showError(
          (err && (err.detail || err.message)) ||
            "We couldn't load the avatars. Please try again."
        );
      });
  }

  // Flicking through five race pills shouldn't fire five requests.
  function fetchSoon() {
    if (state.fetchTimer) clearTimeout(state.fetchTimer);
    state.fetchTimer = setTimeout(function () {
      state.fetchTimer = null;
      fetchCatalog();
    }, 180);
  }

  /* ---------------------------- selection ---------------------------- */

  function selectCard(card) {
    if (!card || card.hasAttribute("data-avatar-unavailable")) return;
    var id = attr(card, "data-avatar-id", null);
    if (!id) return;

    var found = null;
    state.avatars.forEach(function (av) {
      if (av && av.id === id) found = av;
    });
    if (!found) return;

    // Buffered in memory only, and it supersedes any selfie the user took
    // (the core clears FC.photo for us). The URL is deliberately NOT relied
    // on later — it expires in ~10 minutes; only the id is durable.
    FC.setAvatar({
      id: found.id,
      slug: found.slug || null,
      url: found.url || null,
      race: state.race,
      gender: state.gender,
      ageGroup: found.age_group || null,
      variant: found.variant || null,
    }); // setAvatar also stores FC.avatarGender, which pre-fills /onboarding

    all("[data-avatar-option]", state.wrap).forEach(function (node) {
      var cls = attr(node, "data-selected-class", "is-selected");
      var on = node === card;
      if (node.classList) node.classList.toggle(cls, on);
      node.setAttribute("aria-pressed", on ? "true" : "false");
    });
    clearError();
    setNextEnabled(true);
    dbg("selected", found.slug || found.id);
  }

  /* --------------------------- navigation --------------------------- */

  function nextUrl() {
    var btn = one("[data-avatar-next]");
    return (
      (btn && (attr(btn, "data-avatar-next", null) || realHref(btn))) ||
      attr(state.wrap, "data-avatar-next-url", "/onboarding")
    );
  }

  function onNext() {
    if (!selectedId()) {
      showError("Pick the one that looks most like you to continue.");
      return;
    }
    go(nextUrl());
  }

  /* ------------------------ delegated listeners ------------------------ */

  function onClick(e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function" || !state.wrap) return;

    var genderPill = t.closest("[data-avatar-gender]");
    if (genderPill) {
      e.preventDefault();
      var g = attr(genderPill, "data-avatar-gender", "");
      if (g && g !== state.gender && inList(GENDERS, g)) {
        state.gender = g;
        reflectPills();
        fetchSoon();
      }
      return;
    }

    var racePill = t.closest("[data-avatar-race]");
    if (racePill) {
      e.preventDefault();
      var r = attr(racePill, "data-avatar-race", "");
      if (r && r !== state.race && inList(RACES, r)) {
        state.race = r;
        reflectPills();
        fetchSoon();
      }
      return;
    }

    var card = t.closest("[data-avatar-option]");
    if (card) {
      e.preventDefault();
      selectCard(card);
      return;
    }

    var nextBtn = t.closest("[data-avatar-next]");
    if (nextBtn) {
      e.preventDefault();
      onNext();
      return;
    }

    var backBtn = t.closest("[data-avatar-back]");
    if (backBtn) {
      e.preventDefault();
      var url =
        attr(backBtn, "data-avatar-back", null) ||
        realHref(backBtn) ||
        attr(state.wrap, "data-avatar-back-url", null);
      if (url) go(url);
      else if (window.history && window.history.length > 1)
        window.history.back();
      return;
    }
  }
  document.addEventListener("click", onClick);

  /* --------------------------- init / teardown --------------------------- */

  // Matches the quiz/reveal resolvers: [data-avatar] may BE the container.
  function resolveWrap(scope) {
    scope = scope || document;
    if (scope.matches && scope.matches("[data-avatar]")) return scope;
    var found = scope.querySelector && scope.querySelector("[data-avatar]");
    if (found) return found;
    return scope !== document ? document.querySelector("[data-avatar]") : null;
  }

  /* Stamp the loading state on the INCOMING container before it paints.
     init() runs on afterEnter (it needs transition.js's synced nav + glass),
     and the fetch only starts there — which left a beat where the Designer's
     placeholder cards were fully visible. beforeEnter fires before the enter
     animation, so the skeleton is already on when the page fades in.
     Deliberately scope-limited (no document fallback): priming must be a
     no-op when we're navigating to any other page. */
  function prime(scope) {
    if (!scope) return;
    var wrap =
      scope.matches && scope.matches("[data-avatar]")
        ? scope
        : scope.querySelector && scope.querySelector("[data-avatar]");
    if (!wrap) return;
    injectCSS(wrap);
    wrap.setAttribute("data-avatar-state", "loading");
    show(one("[data-avatar-loading]", wrap), true);
    show(one("[data-avatar-empty]", wrap), false);
    setCardsLoading(true, wrap);
    setControlsLoading(true, wrap);
  }

  function init(scope) {
    var wrap = resolveWrap(scope);
    if (!wrap) return; // not the avatar page
    if (state.wrap === wrap) return; // already initialised
    teardown();

    state.wrap = wrap;
    injectCSS(wrap); // no-op if prime() already did it
    // [data-avatar-grid] may appear MORE THAN ONCE — a 3x3 built as three flex
    // rows is three grids. It is only needed as the append target in clone mode;
    // slot cards are collected from the whole wrapper instead (slotCards()).
    state.grid = one("[data-avatar-grid]", wrap) || one("[data-avatar-grid]");

    // Two ways to build the grid; authored cards win if both are present.
    //   slot  — nine [data-avatar-slot="1".."9"] cards you placed and styled
    //           individually in the Designer, in any arrangement of wrappers.
    //           They are filled in place and NEVER removed.
    //   clone — one [data-avatar-option-template] card, cloned per avatar.
    state.mode = one("[data-avatar-slot]", wrap) ? "slot" : "clone";

    // Previous choice wins over the Designer defaults, so coming back to the
    // page lands on the same set with the same card lit.
    var prev = FC.avatar;
    state.gender =
      (prev && prev.gender) ||
      FC.avatarGender ||
      attr(wrap, "data-avatar-gender-default", "male");
    state.race =
      (prev && prev.race) || attr(wrap, "data-avatar-race-default", "black");
    if (!inList(GENDERS, state.gender)) state.gender = "male";
    if (!inList(RACES, state.race)) state.race = "black";

    clearError();
    reflectPills();
    setNextEnabled(!!selectedId());
    if (state.mode === "clone" && !state.grid) {
      showError("The avatar grid is missing ([data-avatar-grid]).");
      return;
    }
    dbg("mode:", state.mode, "— slot cards found:", slotCards().length);
    // Always a fresh fetch — the presigned urls in the catalog expire in ~10 min.
    fetchCatalog();
  }

  function teardown() {
    state.token++; // invalidate in-flight fetches / image decodes
    // Next/Back live in the PERSISTENT nav — leaving mid-load would otherwise
    // strand is-loading/aria-busy on them for the next page.
    setControlsLoading(false);
    if (state.fetchTimer) clearTimeout(state.fetchTimer);
    state.fetchTimer = null;
    state.wrap = null;
    state.grid = null;
    state.mode = "slot";
    state.avatars = [];
  }

  /* ------------------------------ lifecycle ------------------------------ */

  if (window.barba && window.barba.hooks) {
    // Skeleton first, before the incoming page is visible (see prime()).
    window.barba.hooks.beforeEnter(function (data) {
      prime(data && data.next && data.next.container);
    });
    // afterEnter (not enter): transition.js loads first, so its syncRegions() +
    // LiquidGlass.scan() have already settled the nav buttons and the glass by
    // the time we render clones into the grid. (Same rationale as the other
    // page controllers — see flexicare-selfie.js's note.)
    window.barba.hooks.afterEnter(function (data) {
      init((data && data.next && data.next.container) || document);
    });
    window.barba.hooks.beforeLeave(function (data) {
      // state.wrap is only ever set while we're ON this page, so that alone is
      // the reliable test (the container may BE the wrapper, which querySelector
      // wouldn't find).
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

  FC.avatarPicker = {
    init: init,
    prime: prime,
    teardown: teardown,
    refresh: fetchCatalog,
    report: report,
    races: RACES,
    genders: GENDERS,
  };
})();
