/* ============================================================
   Page Transitions v9 — Barba.js + GSAP, attribute-driven
   ------------------------------------------------------------
   Adds two things over v1:
     • SYNCED REGIONS: persistent wrappers whose *contents* swap
       (e.g. button-navigation-wrapper — the wrapper stays, its
       buttons are replaced from the next page and cross-fade).
     • NAMESPACE VISIBILITY: show/hide a persistent element based
       on which page you're on (e.g. hide the nav buttons on the
       landing page, reveal them everywhere else).

   Requires (loaded first): @barba/core, gsap, and your
   liquid-glass script (exposing LiquidGlass.scan).

   ---- MARKUP ----
   data-barba="wrapper"              once, wraps the whole shell
   data-barba="container"            the ONE div whose contents swap
                                     (put on glass-content-wrapper).
                                     Always the literal word "container";
                                     set once in your symbol, never varies.
   (No per-page namespace needed — page identity is derived from the URL:
    site root "/" or "/index" = landing, every other URL = a normal page.)

   data-page-id="landing"            OPTIONAL, on a container. Overrides the
                                     URL-derived identity for that page, so a
                                     page that isn't the root can still get the
                                     landing page's chrome — e.g. the reveal
                                     page uses it to keep the nav collapsed.
                                     Any value works; it's matched against
                                     data-show-except, which takes a list.

   Inside the container, on animating elements:
     data-anim="1"                   stagger order (number)
     data-anim-from="up|down|left|right"   default "up"
     data-anim-distance="40"         px, default 40
     data-anim-fade="1"              opacity-only fade in/out (no transform).
                                     Use INSTEAD of data-anim on elements that
                                     have a glass press/tilt, so the fade and
                                     the press don't fight over transform.

   PERSISTENT SHELL CLASSES (automatic — no attribute needed):
     Everything outside the container persists across navigations, so any
     per-page CLASS on the shell (e.g. landing-glass-container vs
     glass-container, which differ in flex gap and justify-content) would
     otherwise stay frozen at whatever the first-loaded page shipped. On each
     navigation the shell's classes are copied from the next page's document,
     matched by position in the tree. Nothing to set in Webflow — just keep the
     shell's STRUCTURE identical across pages (same nesting, same element
     order); only classes may differ. If the structure diverges, the mismatched
     branch is skipped rather than guessed at.

   SYNCED REGION (persistent wrapper, OUTSIDE the container):
     data-barba-sync="nav"           on button-navigation-wrapper.
        Its innerHTML is replaced from the next page's matching
        wrapper, then cross-faded. Must exist on every page with
        the same data-barba-sync value.

   VISIBILITY (persistent element, OUTSIDE the container):
     data-show-except="landing"      hidden on the landing page (site
                                     root, or any container carrying
                                     data-page-id="landing"), shown elsewhere.
                                     The value is a LIST: "landing,reveal"
                                     hides it on both identities.
                                     Put on button-navigation-wrapper.
                                     (Value matches URL-derived identity:
                                     "landing" for root, "page" otherwise.)

   PROGRESS BAR (persistent):
     data-progress-bar               on the fill element
     data-progress="0.5"             on each container, target 0..1

   Tunables: window.PageTransition.config
   ============================================================ */
(function () {
  "use strict";

  if (!window.barba || !window.gsap) {
    console.warn(
      "[PageTransition] Barba and/or GSAP not found — load them before this script."
    );
    return;
  }
  var barba = window.barba,
    gsap = window.gsap;

  // Hide animating elements from the FIRST paint so an incoming container can
  // never flash at full opacity before GSAP primes it. Gated behind a class
  // added only now (libs confirmed) — so if this script never runs, nothing
  // is left hidden. GSAP's inline opacity beats this rule when it animates in.
  var fouc = document.createElement("style");
  fouc.textContent =
    ".lg-anim [data-anim]:not([data-text-reveal]),.lg-anim [data-anim-fade]:not([data-text-reveal]){opacity:0}";
  document.head.appendChild(fouc);
  document.documentElement.classList.add("lg-anim");

  var config = {
    duration: 0.55,
    stagger: 0.08,
    distance: 40,
    ease: "power3.out",
    easeOut: "power2.in",
    progressDuration: 0.6,
    syncFade: 0.4, // cross-fade duration for synced regions
    visToggle: 0.4, // fade duration for opacity-only show/hide
    navReveal: 0.85, // height reveal/collapse duration (reserve-space mode)
    navSlide: 28, // px the buttons slide up from the bottom
    navEase: "power3.inOut",
  };
  window.PageTransition = { config: config };

  function animedEls(scope) {
    var els = Array.prototype.slice
      .call(scope.querySelectorAll("[data-anim]"))
      .filter(function (el) {
        // A data-text-reveal element may carry data-anim purely to claim a slot
        // in the stagger order — the word-by-word reveal handles its animation,
        // so it must NOT get the element-level opacity/transform tween.
        return !el.hasAttribute("data-text-reveal");
      });
    els.sort(function (a, b) {
      return (
        (parseFloat(a.getAttribute("data-anim")) || 0) -
        (parseFloat(b.getAttribute("data-anim")) || 0)
      );
    });
    return els;
  }

  // Text-reveal elements taking part in the entrance stagger.
  function revealEls(scope) {
    return Array.prototype.slice.call(
      scope.querySelectorAll("[data-text-reveal]")
    );
  }

  // Opacity-only fade elements: fade in/out with NO transform, so they don't
  // fight a glass press/tilt (which owns transform) on the same element.
  function fadeEls(scope) {
    var els = Array.prototype.slice.call(
      scope.querySelectorAll("[data-anim-fade]")
    );
    els.sort(function (a, b) {
      return (
        (parseFloat(a.getAttribute("data-anim-fade")) || 0) -
        (parseFloat(b.getAttribute("data-anim-fade")) || 0)
      );
    });
    return els;
  }

  function offset(el) {
    var dir = el.getAttribute("data-anim-from") || "up";
    var d = parseFloat(el.getAttribute("data-anim-distance"));
    if (isNaN(d)) d = config.distance;
    switch (dir) {
      case "down":
        return { x: 0, y: -d };
      case "left":
        return { x: d, y: 0 };
      case "right":
        return { x: -d, y: 0 };
      default:
        return { x: 0, y: d };
    }
  }

  /* ---------- main container in/out ---------- */
  function leave(container) {
    var els = animedEls(container),
      fades = fadeEls(container),
      reveals = window.TextReveal ? revealEls(container) : [];
    var tl = gsap.timeline();
    if (!els.length && !fades.length && !reveals.length) {
      return tl.to(container, {
        opacity: 0,
        duration: config.duration * 0.6,
        ease: config.easeOut,
      });
    }
    if (els.length) {
      tl.to(
        els.reverse(),
        {
          opacity: 0,
          y: function (i, el) {
            return -offset(el).y * 0.6;
          },
          x: function (i, el) {
            return -offset(el).x * 0.6;
          },
          duration: config.duration * 0.7,
          ease: config.easeOut,
          stagger: config.stagger * 0.6,
        },
        0
      );
    }
    if (fades.length) {
      tl.to(
        fades,
        {
          opacity: 0,
          duration: config.duration * 0.7,
          ease: config.easeOut,
          stagger: config.stagger * 0.6,
        },
        0
      );
    }
    // Reveal headings are excluded from animedEls (their words own the entrance),
    // so give them their own exit here: a quick fade + blur-out of the whole
    // element (word-by-word is an entrance effect; on leave a unit blur reads
    // cleanly and fast).
    if (reveals.length) {
      tl.to(
        reveals,
        {
          opacity: 0,
          filter: "blur(6px)",
          duration: config.duration * 0.7,
          ease: config.easeOut,
          stagger: config.stagger * 0.6,
        },
        0
      );
    }
    return tl;
  }

  // Set the hidden start state SYNCHRONOUSLY, before the browser paints the
  // new container — prevents the "flash then jump".
  function primeEnter(container, primeReveals) {
    var els = animedEls(container),
      fades = fadeEls(container);
    if (els.length) {
      gsap.set(els, {
        opacity: 0,
        x: function (i, el) {
          return offset(el).x;
        },
        y: function (i, el) {
          return offset(el).y;
        },
      });
    }
    if (fades.length) gsap.set(fades, { opacity: 0 });
    // On navigation, prime the reveal words (hidden + blurred) so nothing
    // flashes before PHASE 2 plays them at their slot. On first load
    // (primeReveals=false) text-reveal's own boot() handles them.
    var reveals = primeReveals && window.TextReveal ? revealEls(container) : [];
    reveals.forEach(function (el) {
      window.TextReveal.prime(el);
      gsap.set(el, { opacity: 1 }); // element visible; words carry the reveal
    });
    if (!els.length && !fades.length && !reveals.length)
      gsap.set(container, { opacity: 0 });
  }

  function enter(container, withReveals) {
    var fades = fadeEls(container);
    var tl = gsap.timeline();

    // Merge animated elements with (on navigation) the text-reveal elements
    // into one order, sorted by data-anim number, so the headline falls at its
    // own slot in the stagger rather than before or after the whole group.
    var items = [];
    animedEls(container).forEach(function (el) {
      items.push({
        el: el,
        type: "anim",
        n: parseFloat(el.getAttribute("data-anim")) || 0,
      });
    });
    if (withReveals && window.TextReveal) {
      revealEls(container).forEach(function (el) {
        var raw = el.getAttribute("data-anim");
        var n = raw === null || raw === "" ? Infinity : parseFloat(raw) || 0;
        items.push({ el: el, type: "reveal", n: n });
      });
    }
    items.sort(function (a, b) {
      return a.n - b.n;
    });

    if (!items.length && !fades.length) {
      return tl.to(container, {
        opacity: 1,
        duration: config.duration,
        ease: config.ease,
      });
    }

    // Each item at its slot (index * stagger). Anim elements get the
    // opacity/transform tween; reveal elements get their word timeline dropped
    // in at the same offset so they blur in as part of the same cascade.
    items.forEach(function (it, i) {
      var at = i * config.stagger;
      if (it.type === "anim") {
        tl.to(
          it.el,
          {
            opacity: 1,
            x: 0,
            y: 0,
            duration: config.duration,
            ease: config.ease,
            clearProps: "transform",
          },
          at
        );
      } else {
        // Fire the reveal exactly when the cascade reaches this slot. We do NOT
        // nest TextReveal.play()'s timeline — a GSAP timeline auto-plays on
        // creation, so nesting it made the reveal ignore its slot and start
        // immediately. A positioned callback starts it on the right beat.
        tl.call(
          function (el) {
            if (window.TextReveal) window.TextReveal.play(el);
          },
          [it.el],
          at
        );
      }
    });

    if (fades.length) {
      // NO clearProps here: the FOUC rule would otherwise reassert opacity:0.
      tl.to(
        fades,
        {
          opacity: 1,
          duration: config.duration,
          ease: config.ease,
          stagger: config.stagger,
        },
        0
      );
    }
    return tl;
  }

  /* ---------- synced regions (persistent wrapper, swapped innards) ----------
         nextDoc is the parsed next-page document Barba provides. For each synced
         wrapper on the current page, find the same [data-barba-sync=NAME] in the
         next doc, replace innerHTML, then cross-fade + play its data-anim stagger. */
  function syncRegions(nextDoc, skipEl) {
    var current = document.querySelectorAll("[data-barba-sync]");
    current.forEach(function (el) {
      if (skipEl && el === skipEl) return; // nav reveal owns this one
      var name = el.getAttribute("data-barba-sync");
      var incoming = nextDoc.querySelector('[data-barba-sync="' + name + '"]');
      if (!incoming) return;
      // The persistent wrapper stays put — its opacity is NEVER touched, so the
      // frame doesn't flash. Only the inner buttons animate: slide the current
      // ones out, swap the innards, slide the new ones in.
      var outgoing = navContent(el);
      var tl = gsap.timeline();
      if (outgoing.length) {
        tl.to(
          outgoing,
          {
            y: config.navSlide,
            opacity: 0,
            duration: config.syncFade * 0.5,
            ease: config.easeOut,
          },
          0
        );
      }
      tl.add(function () {
        el.innerHTML = incoming.innerHTML;
        if (window.LiquidGlass && window.LiquidGlass.scan)
          window.LiquidGlass.scan();
        var incomingKids = navContent(el);
        gsap.set(incomingKids, { y: config.navSlide, opacity: 0 });
        gsap.to(incomingKids, {
          y: 0,
          opacity: 1,
          duration: config.syncFade,
          ease: config.ease,
          stagger: config.stagger,
          clearProps: "transform",
        });
      });
    });
  }

  /* ---------- persistent shell classes ----------
         Barba only swaps the container. EVERYTHING else — the whole shell
         around it — is whatever the FIRST page you loaded shipped, forever.
         So a per-page class on a persistent element is stale after the first
         navigation: land on the site root and the shell stays
         landing-glass-container (flex gap 0, justify-content center) even on
         pages whose own markup says glass-container (gap 1.5rem, flex-start).
         Hard-refreshing that page looked "fixed" only because Webflow then
         served the right shell.

         Matching live elements to their counterparts in the next page's parsed
         document is the whole difficulty: the classes are exactly what differs,
         so they can't be the key, and sibling POSITION is unreliable because
         scripts inject nodes that exist only in the live DOM (glass's per-element
         .lg-layer overlay and its <svg> defs holder on body, the dev tuner's
         panel, the selfie file input). An earlier version matched purely by
         position and pasted padding-global's class onto a glass overlay.

         So two passes, strongest first:

         1. ANCESTOR CHAINS — walk up from anchors that carry a unique ATTRIBUTE
            (the container, synced regions, the nav, the progress bar). Attributes
            are stable, and walking upward never touches siblings, so injected
            nodes anywhere are irrelevant. This is what fixes the shell layout.

         2. DOWNWARD from the container's parent — catches persistent SIBLINGS of
            the container (e.g. top-section-wrapper) which have no attribute of
            their own. Positional, so it is guarded: a child-count or tagName
            mismatch abandons that branch, leaving classes stale rather than
            wrong. Started at the container's parent, not at the wrapper, because
            the wrapper is <body> where injected nodes guarantee a mismatch.

         Deliberately never touched:
           • the container itself and its subtree — Barba owns those
           • [data-barba-sync] subtrees — innerHTML is replaced wholesale,
             classes included, and their buttons carry runtime state classes
             (is-disabled/is-busy) that must not be clobbered */
  function isContainer(el) {
    return el.getAttribute("data-barba") === "container";
  }

  // Nodes that exist only in the live DOM and must never be positionally
  // matched. Attributes, not classes: the class sync rewrites classNames, so a
  // class is not a dependable marker for its own filter.
  function isInjected(el) {
    return (
      el.hasAttribute("data-lg-layer") ||
      el.hasAttribute("data-lg-defs") ||
      el.hasAttribute("data-js-injected") ||
      (el.classList && el.classList.contains("lg-layer"))
    );
  }

  function matchableKids(el) {
    return Array.prototype.filter.call(el.children, function (n) {
      // Containers: mid-transition the live DOM holds TWO (outgoing + incoming)
      // while the next document holds one.
      if (isContainer(n)) return false;
      if (n.hasAttribute("data-barba-placeholder")) return false;
      return !isInjected(n);
    });
  }

  /* A branch that gets abandoned is the bug this whole function exists to
     prevent: the live shell keeps the FIRST page's classes, so the page is
     laid out wrong until a hard refresh makes Webflow serve the right shell.
     It should never happen — it means the shell's STRUCTURE differs between
     two pages in Webflow (an extra wrapper div, a different element order),
     which no amount of class-copying can recover from. So say so, loudly and
     precisely: which element, and what didn't line up. Once per session per
     spot, so a repeated navigation doesn't spam the console. */
  var shellWarned = {};
  var shellIssues = []; // same list, for the visual debug panel
  function shellPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && parts.length < 8) {
      var name = el.tagName.toLowerCase();
      if (el.parentElement) {
        var sibs = Array.prototype.filter.call(
          el.parentElement.children,
          function (n) {
            return n.tagName === el.tagName;
          }
        );
        if (sibs.length > 1)
          name += ":nth-of-type(" + (sibs.indexOf(el) + 1) + ")";
      }
      var cls = (el.className || "").toString().trim().split(/\s+/)[0];
      if (cls) name += "." + cls;
      parts.unshift(name);
      if (el.hasAttribute && el.hasAttribute("data-barba")) break;
      el = el.parentElement;
    }
    return parts.join(" > ");
  }
  function shellWarn(where, detail) {
    var key = where + "|" + detail;
    if (shellWarned[key]) return;
    shellWarned[key] = true;
    shellIssues.push(where + " — " + detail);
    console.warn(
      "[transition] shell class sync ABANDONED at " +
        where +
        " — " +
        detail +
        ". The shell's structure differs between these two pages, so this " +
        "branch keeps the FIRST page's classes and the layout will look wrong " +
        "until a hard refresh. Fix it in Webflow: outside " +
        'data-barba="container" every page must have the SAME nesting and ' +
        "element order — only classes may differ."
    );
  }

  function copyClass(cur, next) {
    if (cur.tagName !== next.tagName) {
      shellWarn(
        shellPath(cur),
        "live is <" +
          cur.tagName.toLowerCase() +
          ">, the next page has <" +
          next.tagName.toLowerCase() +
          ">"
      );
      return false; // diverged — don't guess
    }
    if (cur.className !== next.className) cur.className = next.className;
    return true;
  }

  // PASS 2: positional, guarded.
  function walkShellClasses(cur, next) {
    if (!copyClass(cur, next)) return;
    if (cur.hasAttribute("data-barba-sync")) return; // innerHTML swap owns the inside
    var a = matchableKids(cur),
      b = matchableKids(next);
    // Counts MUST agree. A mismatch means a node exists on one side only, and
    // matching by position would write classes onto the WRONG elements — far
    // worse than stale, since a wrong class can inject padding or hide content.
    if (a.length !== b.length) {
      shellWarn(
        shellPath(cur),
        "live has " +
          a.length +
          " children, the next page has " +
          b.length +
          " (live: " +
          a
            .map(function (n) {
              return n.tagName.toLowerCase();
            })
            .join(",") +
          " / next: " +
          b
            .map(function (n) {
              return n.tagName.toLowerCase();
            })
            .join(",") +
          ")"
      );
      return;
    }
    for (var i = 0; i < a.length; i++) walkShellClasses(a[i], b[i]);
  }

  // PASS 1: walk up both chains in lockstep. Immune to injected siblings.
  function syncAncestors(liveEl, nextEl, wrapper) {
    var a = liveEl.parentElement,
      b = nextEl.parentElement;
    while (a && b) {
      if (!copyClass(a, b)) return;
      if (a === wrapper) return;
      a = a.parentElement;
      b = b.parentElement;
    }
  }

  // Anchors identified by a unique attribute, present on both pages.
  var SHELL_ANCHORS = [
    '[data-barba="container"]',
    "[data-barba-sync]",
    "[data-nav-reveal]",
    "[data-show-except]",
    "[data-progress-bar]",
  ];

  function syncShellClasses(nextDoc) {
    var wrapper = document.querySelector('[data-barba="wrapper"]');
    var nextWrapper = nextDoc.querySelector('[data-barba="wrapper"]');
    if (!wrapper || !nextWrapper) return;

    SHELL_ANCHORS.forEach(function (sel) {
      var live = document.querySelector(sel);
      var next = nextDoc.querySelector(sel);
      if (!live || !next) return;
      // The anchor's OWN class too — except the container's, which belongs to
      // Barba (querySelector finds the OUTGOING one mid-transition, and the
      // incoming one already carries the right class).
      if (!isContainer(live)) copyClass(live, next);
      syncAncestors(live, next, wrapper);
    });

    var c = document.querySelector('[data-barba="container"]');
    var nc = nextDoc.querySelector('[data-barba="container"]');
    if (c && nc && c.parentElement && nc.parentElement)
      walkShellClasses(c.parentElement, nc.parentElement);
  }

  /* The diff tool for "it's wrong on arrival, right after a refresh". Run
     PageTransition.shellSnapshot() on the broken page, hard-refresh, run it
     again: it stores the first result and prints what CHANGED. Anything listed
     is a shell class the sync failed to bring across — the layout bug. */
  function shellSnapshot() {
    var wrapper = document.querySelector('[data-barba="wrapper"]');
    if (!wrapper) return console.warn("[transition] no barba wrapper found");
    var now = {};
    (function walk(el) {
      if (!el || el.nodeType !== 1) return;
      if (isContainer(el)) return; // Barba owns the container's subtree
      if (isInjected(el)) return;
      now[shellPath(el)] = (el.className || "").toString();
      Array.prototype.forEach.call(el.children, walk);
    })(wrapper);

    var key = "fcShellSnapshot:" + location.pathname;
    var prevRaw = null;
    try {
      prevRaw = sessionStorage.getItem(key);
    } catch (e) {}
    try {
      sessionStorage.setItem(key, JSON.stringify(now));
    } catch (e) {}

    if (!prevRaw) {
      console.log(
        "[transition] shell snapshot stored (" +
          Object.keys(now).length +
          " elements). Now hard-refresh this page and run it again."
      );
      return now;
    }
    var prev = JSON.parse(prevRaw);
    var diff = [];
    Object.keys(prev).forEach(function (k) {
      if (!(k in now)) diff.push({ where: k, before: prev[k], after: "(GONE)" });
      else if (prev[k] !== now[k])
        diff.push({ where: k, before: prev[k], after: now[k] });
    });
    Object.keys(now).forEach(function (k) {
      if (!(k in prev)) diff.push({ where: k, before: "(ABSENT)", after: now[k] });
    });
    if (!diff.length)
      console.log(
        "[transition] shell is IDENTICAL between the two runs — the layout " +
          "difference is not stale shell classes. Look at the container's own " +
          "entrance (data-anim y offsets, the nav collapse) instead."
      );
    else {
      console.warn(
        "[transition] " + diff.length + " shell class difference(s) — these " +
          "are what the sync failed to bring across:"
      );
      console.table ? console.table(diff) : console.log(diff);
    }
    return diff;
  }

  window.PageTransition.shellSnapshot = shellSnapshot;

  /* ---------- page identity, derived from the URL ----------
         Landing = site root ("/" or "/index[.html]"). Everything else
         resolves to "page". So data-show-except="landing" hides an
         element only at the root and shows it on every other URL —
         no per-page attribute needed, and new pages just work.
         Pass a URL (Barba gives the next page's href) or omit for current. */
  function pageIdentity(href, container) {
    // An explicit override on the container wins over the URL. That's how a
    // page other than the root borrows the landing page's chrome (e.g. the
    // reveal page hides the nav): data-page-id="landing" on its container.
    // Read from the INCOMING container so it applies on the way in, not a
    // frame late.
    var el =
      container ||
      document.querySelector('[data-barba="container"][data-page-id]');
    var override = el && el.getAttribute && el.getAttribute("data-page-id");
    if (override) return override.trim();

    var path;
    try {
      path = href ? new URL(href, location.origin).pathname : location.pathname;
    } catch (e) {
      path = location.pathname;
    }
    path = path.replace(/\/index(\.html?)?$/i, "/").replace(/\.html?$/i, "");
    if (path === "" || path === "/") return "landing";
    return "page";
  }

  /* ---------- visibility (data-show-except) ----------
         Two modes per element:
         • DEFAULT (opacity): fades opacity only, layout box always reserved, so
           nothing reflows. Used for elements that should just fade in/out.
         • RESERVE-SPACE (add data-nav-reveal): animates the element's HEIGHT
           between 0 and its natural size, sliding its contents up from the
           bottom. Neighbouring flex space (e.g. a flex:1 glass panel above it)
           expands/contracts smoothly to fill. The glass is frozen during the
           size change so its displacement map rebuilds once at the end, not
           every frame. */
  function glassFreeze() {
    if (window.LiquidGlass && window.LiquidGlass.freeze)
      window.LiquidGlass.freeze();
  }
  function glassSettle() {
    if (window.LiquidGlass && window.LiquidGlass.unfreeze)
      window.LiquidGlass.unfreeze(true);
    else if (window.LiquidGlass && window.LiquidGlass.refreshAll)
      window.LiquidGlass.refreshAll();
  }

  // The layer we fade/slide as the wrapper grows. Prefer an explicit inner
  // content wrapper (data-nav-content, or the single child like
  // button-navigation-glass-wrapper) so it works regardless of nesting depth;
  // fall back to the wrapper's direct children.
  function navContent(el) {
    var explicit = el.querySelector("[data-nav-content]");
    if (explicit) return [explicit];
    if (el.children.length === 1) return [el.children[0]];
    return Array.prototype.slice.call(el.children);
  }

  // Belt-and-suspenders: elements inside the nav wrapper are revealed as a
  // unit by this animation, so a leftover data-anim / data-anim-fade on a
  // button would be pinned to opacity 0 by the first-paint guard and never
  // released. Strip those attributes (re-applied fresh each sync, so this is
  // idempotent) and clear any forced opacity.
  function clearStuckOpacity(el) {
    el.querySelectorAll("[data-anim],[data-anim-fade]").forEach(function (n) {
      n.removeAttribute("data-anim");
      n.removeAttribute("data-anim-fade");
      gsap.set(n, { clearProps: "opacity" });
      n.style.opacity = "";
    });
  }

  function navReveal(el, hide, instant) {
    var kids = navContent(el);
    el.style.overflow = "hidden";
    clearStuckOpacity(el);
    if (instant) {
      if (hide) {
        gsap.set(el, { height: 0, paddingTop: 0, paddingBottom: 0 });
        gsap.set(kids, { y: config.navSlide, opacity: 0 });
      } else {
        gsap.set(el, {
          height: "auto",
          clearProps: "height,paddingTop,paddingBottom,overflow",
        });
        gsap.set(kids, { y: 0, opacity: 1, clearProps: "transform,opacity" });
      }
      el.style.pointerEvents = hide ? "none" : "";
      el.__navHidden = hide;
      return null;
    }
    // Only animate when the shown/hidden STATE actually changes — otherwise a
    // page-to-page nav (both non-landing) would wrongly collapse & reopen.
    if (el.__navHidden === hide) return null;
    el.__navHidden = hide;

    glassFreeze();
    var tl = gsap.timeline({
      onComplete: function () {
        if (!hide) {
          el.style.height = "auto";
          el.style.overflow = "";
          gsap.set(kids, { clearProps: "transform,opacity" });
        }
        el.style.pointerEvents = hide ? "none" : "";
        glassSettle(); // rebuild displacement maps once, at the settled size
      },
    });
    if (hide) {
      tl.to(
        kids,
        {
          y: config.navSlide,
          opacity: 0,
          duration: config.navReveal * 0.5,
          ease: "power2.in",
        },
        0
      ).to(
        el,
        {
          height: 0,
          paddingTop: 0,
          paddingBottom: 0,
          duration: config.navReveal,
          ease: config.navEase,
        },
        0
      );
    } else {
      el.style.pointerEvents = "";
      gsap.set(el, { height: 0 });
      gsap.set(kids, { y: config.navSlide, opacity: 0 });
      // whole content fades in together as the wrapper grows
      tl.to(
        el,
        { height: "auto", duration: config.navReveal, ease: config.navEase },
        0
      ).to(
        kids,
        {
          y: 0,
          opacity: 1,
          duration: config.navReveal * 0.7,
          ease: "power2.out",
        },
        config.navReveal * 0.2
      );
    }
    return tl;
  }

  function applyVisibility(namespace, instant) {
    var navTL = null;
    document.querySelectorAll("[data-show-except]").forEach(function (el) {
      var hideOn = (el.getAttribute("data-show-except") || "")
        .split(",")
        .map(function (s) {
          return s.trim();
        });
      var shouldHide = hideOn.indexOf(namespace) !== -1;
      if (el.hasAttribute("data-nav-reveal")) {
        var tl = navReveal(el, shouldHide, instant);
        if (tl) navTL = tl; // capture the (single) nav reveal timeline to await
        return;
      }
      el.style.pointerEvents = shouldHide ? "none" : "";
      if (instant) {
        gsap.set(el, { opacity: shouldHide ? 0 : 1 });
      } else {
        gsap.to(el, {
          opacity: shouldHide ? 0 : 1,
          duration: config.visToggle,
          ease: "power2.out",
        });
      }
    });
    return navTL;
  }

  // Silent innerHTML swap for a synced region (no cross-fade) — used when the
  // nav reveal is going to animate the same wrapper, so it owns the motion.
  function syncSwapSilent(nextDoc, el) {
    var name = el.getAttribute("data-barba-sync");
    if (!name) return;
    var incoming = nextDoc.querySelector('[data-barba-sync="' + name + '"]');
    if (!incoming) return;
    el.innerHTML = incoming.innerHTML;
    if (window.LiquidGlass && window.LiquidGlass.scan)
      window.LiquidGlass.scan();
  }

  function updateProgress(nextContainer) {
    var bar = document.querySelector("[data-progress-bar]");
    if (!bar) return;
    var target = nextContainer.getAttribute("data-progress");
    if (target === null) return;
    var pct = Math.max(0, Math.min(1, parseFloat(target) || 0)) * 100;
    gsap.to(bar, {
      width: pct + "%",
      duration: config.progressDuration,
      ease: "power2.inOut",
    });
  }

  function reinit() {
    if (window.LiquidGlass && window.LiquidGlass.scan)
      window.LiquidGlass.scan();
  }

  /* ---------- overlap positioning ----------
         During a transition both containers briefly share a parent and stack
         vertically, so the incoming content lands BELOW the outgoing and snaps
         up when the old one is removed. Fix: pull the LEAVING container out of
         flow (absolute) at transition start, so the incoming container occupies
         the correct slot immediately and animates in right where it belongs.

         BUT: Barba only inserts the next container AFTER leave() resolves
         (order is leave → afterLeave → add → beforeEnter → enter). So between
         "current goes absolute" and "next is inserted" the shared parent has a
         hole in it, and any PERSISTENT sibling — e.g. top-section-wrapper above
         the container — reflows into the vacated space for the length of the
         leave animation, then snaps back. Fix: park a rigid placeholder of the
         exact same box in the container's slot for the duration of that gap,
         and drop it in beforeEnter, the moment the real container lands. */
  var overlapReset = null;
  var overlapPlaceholder = null;
  function removePlaceholder() {
    if (overlapPlaceholder && overlapPlaceholder.parentNode)
      overlapPlaceholder.parentNode.removeChild(overlapPlaceholder);
    overlapPlaceholder = null;
  }
  function beginOverlap(currentContainer) {
    var parent = currentContainer.parentElement;
    if (!parent) return;
    var parentPosWasStatic = getComputedStyle(parent).position === "static";
    var cs = getComputedStyle(currentContainer);
    var r = currentContainer.getBoundingClientRect();
    var pr = parent.getBoundingClientRect();
    if (parentPosWasStatic) parent.style.position = "relative";

    // Hold the slot open. Same border-box + margins as the container, but rigid
    // (no flex grow/shrink) so the parent's layout is byte-identical to before.
    // Inserted and the container un-flowed in the SAME task — nothing is painted
    // in between, so there is no frame where both occupy space.
    removePlaceholder(); // stale one from an interrupted transition
    var ph = document.createElement("div");
    ph.setAttribute("data-barba-placeholder", "");
    ph.setAttribute("aria-hidden", "true");
    ph.style.width = r.width + "px";
    ph.style.height = r.height + "px";
    ph.style.marginTop = cs.marginTop;
    ph.style.marginRight = cs.marginRight;
    ph.style.marginBottom = cs.marginBottom;
    ph.style.marginLeft = cs.marginLeft;
    ph.style.flex = "0 0 auto";
    ph.style.alignSelf = cs.alignSelf;
    ph.style.pointerEvents = "none";
    ph.style.visibility = "hidden";
    parent.insertBefore(ph, currentContainer.nextSibling);
    overlapPlaceholder = ph;

    // freeze size so it doesn't reflow when it leaves flow
    currentContainer.style.width = r.width + "px";
    currentContainer.style.height = r.height + "px";
    currentContainer.style.position = "absolute";
    currentContainer.style.top = r.top - pr.top + "px";
    currentContainer.style.left = r.left - pr.left + "px";
    currentContainer.style.zIndex = "1";
    currentContainer.style.pointerEvents = "none";
    overlapReset = function () {
      if (parentPosWasStatic && parent) parent.style.position = "";
      overlapReset = null;
    };
  }
  function endOverlap() {
    removePlaceholder(); // backstop: normally dropped in beforeEnter
    if (overlapReset) overlapReset();
  }

  barba.init({
    transitions: [
      {
        name: "stagger",
        beforeEnter(data) {
          // The next container is now in the DOM, so the slot-holder has done
          // its job — drop it before anything paints, or the parent would
          // briefly be sized for two containers.
          removePlaceholder();
          primeEnter(data.next.container, true); // navigation: prime reveals too
        },
        beforeOnce(data) {
          primeEnter(data.next.container, false); // first load: boot() handles reveals
        },
        async leave(data) {
          beginOverlap(data.current.container); // free the slot for the incoming page
          await leave(data.current.container);
        },
        async enter(data) {
          window.scrollTo(0, 0);
          var ns = pageIdentity(
            data.next.url && data.next.url.href,
            data.next.container
          );
          var nextDoc = new DOMParser().parseFromString(
            data.next.html,
            "text/html"
          );

          // Bring the persistent shell's per-page classes up to date FIRST —
          // they change flex gap / justify-content, so the nav reveal below
          // must measure heights against the incoming page's layout, not the
          // one we're leaving.
          syncShellClasses(nextDoc);

          // Will the nav's shown/hidden state change on this navigation?
          var navEl = document.querySelector("[data-nav-reveal]");
          var navWillAnimate = false;
          if (navEl) {
            var hideOn = (navEl.getAttribute("data-show-except") || "")
              .split(",")
              .map(function (s) {
                return s.trim();
              });
            var shouldHide = hideOn.indexOf(ns) !== -1;
            navWillAnimate = navEl.__navHidden !== shouldHide;
          }

          // Put the correct synced buttons in place. If the nav is about to
          // animate its height/slide, swap silently and let the reveal move
          // them; otherwise cross-fade them (page-to-page button change).
          if (navEl && navWillAnimate) {
            syncSwapSilent(nextDoc, navEl);
            syncRegions(nextDoc, navEl); // handle any OTHER synced regions, skip navEl
          } else {
            syncRegions(nextDoc);
          }

          // PHASE 1 — nav leads: reserve/return space + slide buttons, alone.
          var navTL = applyVisibility(ns, false);
          if (navTL) await navTL; // GSAP timelines are thenable

          // PHASE 2 — everything else animates in (headline included, at its slot).
          updateProgress(data.next.container);
          return enter(data.next.container, true);
        },
        once(data) {
          var ns = pageIdentity(null, data.next.container);
          applyVisibility(ns, true);
          updateProgress(data.next.container);
          return enter(data.next.container, false); // reveals handled by boot()
        },
      },
    ],
    timeout: 7000,
  });

  barba.hooks.afterEnter(function () {
    endOverlap();
    reinit();
  });
  barba.hooks.after(function () {
    endOverlap();
  });

  /* ---------- the layout debug panel (dev only) ----------
         Gated behind ?fcdebug in the URL (or localStorage.fcDebug = "1"),
         exactly like the glass and orb tuners. Nothing renders without it.

         What it's for: "the layout is wrong on arrival but right after a
         refresh" has several possible causes that all look identical on
         screen, and reading them off the console mid-transition is
         unpleasant. This shows the four numbers that separate them, live:

           PAGE ID   what pageIdentity() resolved, and from WHERE. If the
                     reveal page doesn't say "landing (data-page-id)", the
                     attribute is missing from its container in Webflow and
                     the nav is being SHOWN here — which is the thing that
                     pushes the content down and off the screen.
           NAV       should-hide vs actually-hidden, plus the wrapper's live
                     height. Watch it during a navigation: the height ticking
                     UP from 0 is the nav revealing, and whatever moves with
                     it is being pushed by it.
           OVERFLOW  how far the page exceeds the viewport. Non-zero here is
                     literally the bug, and it tells you WHEN it starts.
           SHELL     any branch the class sync had to abandon.

         The nav wrapper is also outlined, so there's no doubt which element
         it is. Marked data-js-injected so the shell class sync skips it. */
  /* ?fcdebug sticks (localStorage), because the thing being debugged spans a
     NAVIGATION and barba.go() doesn't carry the query string to the next page.
     Turn it off with ?fcdebug=off. */
  var DEBUG_ON = (function () {
    var m = /[?&]fcdebug(?:=([^&]*))?/.exec(location.search);
    var stored = false;
    try {
      stored = localStorage.getItem("fcDebug") === "1";
    } catch (e) {}
    if (!m) return stored;
    var off = m[1] === "off" || m[1] === "0" || m[1] === "false";
    try {
      if (off) localStorage.removeItem("fcDebug");
      else localStorage.setItem("fcDebug", "1");
    } catch (e) {}
    return !off;
  })();

  function buildDebugPanel() {
    var css = document.createElement("style");
    css.setAttribute("data-js-injected", "");
    css.textContent =
      "#fc-debug{position:fixed;left:12px;bottom:12px;z-index:2147483647;" +
      "font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;" +
      "background:rgba(6,8,20,.92);color:#dfe6ff;border:1px solid rgba(160,200,255,.35);" +
      "border-radius:10px;padding:9px 11px;max-width:340px;white-space:pre-wrap;" +
      "box-shadow:0 8px 28px rgba(0,0,0,.5);pointer-events:auto;backdrop-filter:blur(6px)}" +
      "#fc-debug b{color:#b7ff5a;font-weight:600}" +
      "#fc-debug .bad{color:#ff7a7a}" +
      "#fc-debug .ok{color:#7affa8}" +
      "#fc-debug .x{float:right;cursor:pointer;opacity:.6;margin-left:10px}" +
      "[data-fc-outline]{outline:2px dashed rgba(255,120,120,.9)!important;outline-offset:-2px}";
    (document.head || document.documentElement).appendChild(css);

    var box = document.createElement("div");
    box.id = "fc-debug";
    box.setAttribute("data-js-injected", "");
    document.body.appendChild(box);

    var peak = 0; // worst overflow seen — the transient spike is the story
    function esc(v) {
      return String(v == null ? "" : v).replace(/</g, "&lt;");
    }
    function paint() {
      var navEl = document.querySelector("[data-nav-reveal]");
      var container = document.querySelector('[data-barba="container"]');
      var overrideEl = document.querySelector(
        '[data-barba="container"][data-page-id]'
      );
      var ns = pageIdentity();
      var from = overrideEl ? "data-page-id" : "URL";

      var navBits = "not found";
      if (navEl) {
        var hideOn = (navEl.getAttribute("data-show-except") || "")
          .split(",")
          .map(function (t) {
            return t.trim();
          });
        var shouldHide = hideOn.indexOf(ns) !== -1;
        var h = Math.round(navEl.getBoundingClientRect().height);
        var isHidden = navEl.__navHidden;
        var agree = !!isHidden === shouldHide;
        navBits =
          '<span class="' +
          (agree ? "ok" : "bad") +
          '">should ' +
          (shouldHide ? "HIDE" : "SHOW") +
          " / is " +
          (isHidden ? "hidden" : "shown") +
          "</span>  h=" +
          h +
          "px\n            show-except=" +
          esc(navEl.getAttribute("data-show-except"));
        navEl.setAttribute("data-fc-outline", "");
      }

      var over = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      if (over > peak) peak = over;

      box.innerHTML =
        '<span class="x" title="hide">✕</span><b>FC LAYOUT DEBUG</b>\n' +
        "PAGE ID   " +
        '<span class="' +
        (overrideEl || ns === "landing" || ns === "page" ? "" : "bad") +
        '">' +
        esc(ns) +
        "</span> (from " +
        from +
        ")\n" +
        "NAV       " +
        navBits +
        "\n" +
        "OVERFLOW  " +
        '<span class="' +
        (over ? "bad" : "ok") +
        '">' +
        over +
        "px</span>   peak " +
        '<span class="' +
        (peak ? "bad" : "ok") +
        '">' +
        peak +
        "px</span>\n" +
        "VIEWPORT  " +
        window.innerHeight +
        "px   doc " +
        document.documentElement.scrollHeight +
        "px\n" +
        "CONTAINER " +
        (container
          ? Math.round(container.getBoundingClientRect().height) + "px"
          : "not found") +
        "\n" +
        "SHELL     " +
        (shellIssues.length
          ? '<span class="bad">' +
            shellIssues.length +
            " abandoned branch(es)</span>\n          " +
            esc(shellIssues[shellIssues.length - 1])
          : '<span class="ok">in sync</span>');
    }
    box.addEventListener("click", function (e) {
      if (e.target && e.target.className === "x") {
        box.style.display = "none";
        document.querySelectorAll("[data-fc-outline]").forEach(function (n) {
          n.removeAttribute("data-fc-outline");
        });
      } else {
        peak = 0; // click the panel to reset the peak before a navigation
      }
    });
    (function tick() {
      paint();
      requestAnimationFrame(tick);
    })();
  }

  if (DEBUG_ON) {
    if (document.body) buildDebugPanel();
    else document.addEventListener("DOMContentLoaded", buildDebugPanel);
  }
})();
