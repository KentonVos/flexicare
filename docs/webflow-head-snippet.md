# Webflow head snippet (`window.__fcLayout`)

`flexicare-core.js` reads `window.__fcLayout` to know the layout mode (desktop / tablet /
mobile) and whether the viewport was pinned before first paint. That value is set by this
head snippet, which lives in Webflow, NOT sourced from the CDN:

> Webflow → **Site Settings → Custom Code → Head Code** → paste the whole block → Save → Publish

> **Changed 2026-09-01** — the viewport string now ends `, viewport-fit=cover` (for the
> fullscreen kiosk tablets). The copy in Webflow is the one that runs, so **re-paste the
> block below** or the change has no effect. Verify with
> `document.querySelector('meta[name=viewport]').content` on the live site.

It must run in the `<head>` before first paint because it rewrites the viewport meta tag
(so the page doesn't visibly reflow) and sets the layout mode. It's site-wide (not
per-page) so it's present whichever page the visitor lands on first; Barba then keeps it
alive across navigations because it never reloads the document. **Paste it once, site-wide
only — never also in page-level custom code.**

## What it does

Webflow's tablet breakpoint is just `@media (max-width: 991px)`. A landscape iPad Pro
reports 1366 CSS px and an iPad Air 1180, so both would otherwise get desktop styles. This
detects tablets and pins the reported viewport width to 991, so every Webflow tablet rule
fires and `window.innerWidth` becomes 991 too (JS width checks agree).

## How to tell if it's installed (console on the live/preview site)

```js
Flexicare.layout           // { isTablet, mode, forced, naturalWidth }
Flexicare.layout.forced    // true  = snippet installed and pinned the viewport
                           // false = snippet MISSING (core fell back to UA sniffing)
```

If `forced` is `false` on a large tablet/iPad, the snippet isn't in place.

## CSS/JS hooks it exposes

- `html[data-layout="tablet|mobile|desktop"]` — style off this
- `html[data-viewport-forced="true|false"]`
- `window.__fcLayout` — read by `Flexicare.isTablet()`

---

## The snippet (source of truth — keep in sync with Webflow)

```html
<!-- Keep this css code to improve the font quality-->
<style>
  * {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -o-font-smoothing: antialiased;
}
</style>

<!-- ============================================================
     Flexicare — force tablet breakpoint on ALL tablets
     ------------------------------------------------------------
     WHERE THIS GOES:
       Webflow Designer -> Site Settings (not page settings)
         -> Custom Code -> "Head Code" -> paste this ENTIRE block
         -> Save -> Publish

     WHY THE HEAD, AND WHY SITE-WIDE:
       This rewrites the viewport meta tag, which the browser reads
       before it paints. In the footer it would fire too late and the
       page would visibly reflow. Site-wide (rather than per page) so
       it is present no matter which page the visitor lands on first;
       after that, Barba keeps it alive across navigations because it
       never reloads the document.

     WHAT IT DOES:
       Webflow's tablet breakpoint is just @media (max-width: 991px).
       A landscape iPad Pro reports 1366 CSS px and an iPad Air 1180,
       so both get desktop styles. This detects tablets and pins the
       reported viewport width to 991, so the browser scales the page
       to fit — every Webflow tablet rule fires, and window.innerWidth
       becomes 991 too, so JS width checks agree.

     DO NOT also paste this in page-level custom code. Once only.
     ============================================================ -->
<script>
(function () {
  "use strict";

  var TABLET_MAX = 991; // Webflow's tablet ceiling — leave alone unless you moved it
  var PHONE_MAX  = 767; // below this the native breakpoints are already correct

  var html = document.documentElement;

  // Reuse Webflow's viewport tag if present, otherwise create one.
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "viewport");
    (document.head || html).appendChild(meta);
  }

  var ua = navigator.userAgent || "";
  var touchPoints = navigator.maxTouchPoints || 0;
  var coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  var noHover = !!(window.matchMedia && window.matchMedia("(hover: none)").matches);

  function isTablet() {
    if (/iPad/.test(ua)) return true;                          // older iPads
    if (/Macintosh/.test(ua) && touchPoints > 1) return true;   // iPadOS 13+ claims to be a Mac
    if (/Android/.test(ua) && !/Mobile/.test(ua)) return true;  // Android tablets omit "Mobile"
    if (/Silk|Kindle|PlayBook|Tablet/i.test(ua)) return true;   // Fire tablets, misc

    // Generic fallback: a coarse, hover-less pointer on a physically large
    // screen. Delete these two lines if you do NOT want touchscreen Windows
    // laptops (Surface etc.) treated as tablets.
    if (coarse && noHover && Math.min(screen.width, screen.height) >= 600) return true;

    return false;
  }

  // The width the device WOULD report at scale 1. screen.* stays
  // scale-independent after we override the meta tag; innerWidth does not,
  // so never use innerWidth here or the second call reads 991 and unlatches.
  function naturalWidth() {
    var landscape = window.matchMedia
      ? window.matchMedia("(orientation: landscape)").matches
      : screen.width > screen.height;
    return landscape
      ? Math.max(screen.width, screen.height)
      : Math.min(screen.width, screen.height);
  }

  var tablet = isTablet();

  function apply() {
    var w = naturalWidth();
    var force = tablet && w > TABLET_MAX;

    /* No initial-scale when forcing — it cancels the fit-to-width scaling.

       viewport-fit=cover lets content reach into a display cutout, which the
       kiosk tablets need once they run fullscreen. It is appended HERE rather
       than added as a second <meta name="viewport"> tag: this function owns
       that tag and replaces `content` wholesale, so a separate tag is either
       silently overwritten or — if it wins the race — cancels the tablet pin.

       Do NOT add maximum-scale/user-scalable here. On the forced branch they
       fight the fit-to-width scaling; pinch-zoom is better killed with
       `touch-action: manipulation` in CSS (see docs/kiosk-tablet-setup.md). */
    meta.setAttribute(
      "content",
      (force ? "width=" + TABLET_MAX : "width=device-width, initial-scale=1") +
        ", viewport-fit=cover"
    );

    // Hooks for CSS and JS. Style with html[data-layout="tablet"] { ... }
    html.setAttribute("data-layout", tablet ? "tablet" : (w <= PHONE_MAX ? "mobile" : "desktop"));
    html.setAttribute("data-viewport-forced", force ? "true" : "false");

    // Read by Flexicare core -> Flexicare.isTablet()
    window.__fcLayout = {
      isTablet: tablet,
      mode: html.getAttribute("data-layout"),
      forced: force,
      naturalWidth: w
    };
  }

  apply();

  // Rotation changes the natural width — a portrait iPad (820px) needs no
  // forcing, landscape (1180px) does. Timeout lets screen.* settle first.
  window.addEventListener("orientationchange", function () {
    setTimeout(apply, 50);
  });
})();
</script>
```
