/* ============================================================
   Text Reveal v2.2 — word-by-word fade + deblur (Barba + GSAP)
   ------------------------------------------------------------
   Plain JS. Load AFTER gsap and page-transitions (which init Barba).

   Tag any text element:  data-text-reveal
     • Splits text into words (they wrap naturally, no re-measuring).
     • Each word animates from opacity 0 + blur -> opacity 1 + blur 0,
       in place (no movement), staggered across the words.
     • Primes before the incoming Barba page paints (no flash) and
       plays once the page is settled; also runs on first load.

   TIP: put data-anim="N" on a data-text-reveal element to set its slot in the
   entrance stagger (see the v2.2 note). Without it, the headline reveals after
   the numbered elements.

   --- v2.2 -----------------------------------------------------
   Navigation timing is owned by page-transitions (transition.js).
   Give the reveal element a data-anim="N" to place it in the entrance
   stagger; transition.js primes it and drops its word timeline into
   PHASE 2 at that slot, so the headline blurs in WITH the content.
   (v2.1 played on afterEnter, which landed it dead last.) This module
   keeps handling FIRST LOAD via boot() and no longer registers its own
   Barba enter/afterEnter hooks. Requires transition.js v9.1+.

   NOTE: it is now CORRECT to put data-anim on a data-text-reveal
   element (the opposite of the old rule) — transition.js detects the
   reveal and skips the element-level transform, so nothing conflicts.
   -------------------------------------------------------------

   Per-element overrides (optional):
     data-reveal-blur="8"          start blur in px
     data-reveal-duration="0.6"    per-word tween seconds
     data-reveal-stagger="0.03"    delay between words, seconds
     data-reveal-ease="power2.out"

   Global defaults: window.TextReveal.config
   API: TextReveal.refresh(scope) to re-scan elements added later.
   ============================================================ */
(function () {
  "use strict";

  if (!window.gsap) {
    console.warn("[TextReveal] GSAP not found — load it first.");
    return;
  }
  var gsap = window.gsap;

  var config = {
    blur: 8,
    duration: 0.6,
    stagger: 0.03,
    ease: "power2.out",
  };
  window.TextReveal = { config: config };

  var SELECTOR = "[data-text-reveal]";

  // FOUC guard: hide targets from first paint, only now that GSAP is confirmed.
  var css = document.createElement("style");
  css.textContent =
    ".tr-ready " +
    SELECTOR +
    "{visibility:hidden}" +
    ".tr-word{display:inline-block;will-change:opacity,filter}";
  document.head.appendChild(css);
  document.documentElement.classList.add("tr-ready");

  function opt(el, key, def) {
    var v = el.getAttribute("data-reveal-" + key);
    if (v === null || v === "") return def;
    var n = parseFloat(v);
    // eases are strings; numbers parse — return string when not numeric
    return key === "ease" ? v || def : isNaN(n) ? def : n;
  }

  /* ---- split element text into word spans (wrap naturally) ---- */
  function splitWords(el) {
    if (el.__trSplit) return;
    el.__trOriginal = el.innerHTML;
    var text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) {
      el.__trSplit = true;
      el.__trWords = [];
      return;
    }
    el.innerHTML = "";
    var words = text.split(" ");
    var spans = [];
    words.forEach(function (w, i) {
      var s = document.createElement("span");
      s.className = "tr-word";
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
      spans.push(s);
    });
    el.__trSplit = true;
    el.__trWords = spans;
  }

  function words(el) {
    return el.__trWords && el.__trWords.length
      ? el.__trWords
      : Array.prototype.slice.call(el.querySelectorAll(".tr-word"));
  }

  /* ---- prime: split + hidden/blurred start state, then make visible ---- */
  function prime(el) {
    splitWords(el);
    var b = opt(el, "blur", config.blur);
    gsap.set(words(el), { opacity: 0, filter: "blur(" + b + "px)" });
    el.style.visibility = "visible";
  }

  /* ---- play: fade + deblur each word, staggered ---- */
  function play(el) {
    var ws = words(el);
    el.style.visibility = "visible";
    if (!ws.length) return gsap.timeline();
    // Guard against double-play (e.g. boot() plus a stray call): once a reveal
    // is running or done, return its existing timeline instead of re-triggering.
    if (el.__trPlaying) return el.__trTL || gsap.timeline();
    el.__trPlaying = true;
    var dur = opt(el, "duration", config.duration);
    var stg = opt(el, "stagger", config.stagger);
    var ease = opt(el, "ease", config.ease);
    var b = opt(el, "blur", config.blur);
    var tl = gsap.timeline({
      onComplete: function () {
        el.__trPlayed = true;
        // hand styling back to CSS once revealed
        gsap.set(ws, { clearProps: "filter,opacity,willChange" });
      },
    });
    el.__trTL = tl;
    tl.fromTo(
      ws,
      { opacity: 0, filter: "blur(" + b + "px)" },
      {
        opacity: 1,
        filter: "blur(0px)",
        duration: dur,
        ease: ease,
        stagger: stg,
      }
    );
    return tl;
  }

  function primeAll(scope) {
    (scope || document).querySelectorAll(SELECTOR).forEach(prime);
  }
  function playAll(scope) {
    (scope || document).querySelectorAll(SELECTOR).forEach(play);
  }

  /* ---- Navigation is driven by page-transitions (transition.js) ----
       It primes (in primeEnter) and plays (in its PHASE 2 timeline) each reveal
       at the element's data-anim slot, so the headline staggers in WITH the
       content. This module therefore registers NO Barba enter/afterEnter hooks —
       doing so would double-play and ignore the stagger order. First load below. */

  /* ---- first load (Barba's `once` path — transition.js leaves reveals to us
            there, so boot() plays them) ---- */
  function boot() {
    primeAll(document);
    playAll(document);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TextReveal.refresh = function (scope) {
    primeAll(scope);
    playAll(scope);
  };
  window.TextReveal.prime = prime;
  window.TextReveal.play = play;
})();
