# Avatar picker — the loading (shimmer) state

The problem this solves: navigating to the avatar page showed the *authored*
cards — the Designer's placeholder faces — for a beat before the catalog
landed. `flexicare-avatar.js` now stamps a loading state early and per-card, and
ships the shimmer CSS with the script (see *Why the CSS ships with the script*
below — a page-head `<style>` does not survive a Barba navigation).

## What the script stamps

| Where | What | When |
|---|---|---|
| `[data-avatar]` wrapper | `data-avatar-state="loading"` | from **beforeEnter** (before the incoming page is visible) until the grid renders |
| every card | `data-avatar-card-state="loading" \| "ready" \| "unavailable"` | `"loading"` until *that card's* image has decoded |
| every card | class `is-loading` + `aria-busy="true"` | same window as the card state |
| gender/race pills, Next, Back | class `is-loading` + `aria-busy="true"` | while the catalog is in flight |

Two layers on purpose: the **wrapper** state covers the whole page before
anything is known; the **per-card** state releases each card the moment its own
face has decoded, so the grid fills in rather than popping all at once.

Override the class name on any element with `data-loading-class="YourCombo"`.
Pills stay clickable while busy — switching filters mid-load is intended.

## Why the CSS ships with the script (and why a page-head `<style>` fails)

**Barba only swaps the container — the `<head>` never changes.** So CSS pasted
into a *page's* Custom Code (Page Settings → Inside `<head>`) is present on a
hard load and completely absent when you arrive via `barba.go()`. That is the
"the shimmer only works after I reload" bug, exactly.

So `flexicare-avatar.js` injects the stylesheet itself, once, into the
persistent head (marked `data-js-injected` so `transition.js`'s shell sync
leaves it alone) — the same trick `transition.js` uses for its FOUC rule.

Nothing to paste. Two ways to change the look:

- **CSS variables** on `[data-avatar]` (or `:root`) — the quick knobs:
  `--fc-skeleton-bg`, `--fc-skeleton-sheen`, `--fc-skeleton-speed`,
  `--fc-skeleton-fade`.
- **Override any rule.** The injected selectors are wrapped in `:where()`, so
  they have *zero* specificity — one plain rule of yours beats them, no
  `!important` needed. Put it in the **site** head (Site Settings → Custom
  Code → Head), never a page's, for the reason above.
- **Opt out completely:** `data-avatar-skeleton="off"` on the `[data-avatar]`
  wrapper. The script then stamps the states but injects no CSS at all.

## Webflow steps

1. On the `[data-avatar]` wrapper, add a **static** attribute
   `data-avatar-state` = `loading`. This is the one manual bit: on a hard load
   the scripts run in the footer, so without it the placeholder cards paint
   first. The script clears it.
2. That's it. No `<style>` to paste, no new elements. (Optional: keep a
   `[data-avatar-loading]` element for a "loading avatars…" line; it is
   shown/hidden automatically.)

## The injected stylesheet, expanded

This is what the script inserts — reproduced here so you know what you're
overriding. You do **not** need to paste it; if you want to hand-tune the whole
thing, set `data-avatar-skeleton="off"` and paste an edited copy into the
**site** head.

```html
<style>
  @keyframes fc-avatar-shimmer {
    from { background-position: -150% 0; }
    to   { background-position:  250% 0; }
  }

  :where([data-avatar]) {
    --fc-skeleton-bg: rgba(255, 255, 255, 0.06);
    --fc-skeleton-sheen: rgba(255, 255, 255, 0.18);
    --fc-skeleton-speed: 1.5s;
    --fc-skeleton-fade: 0.35s;
  }

  /* A card with nothing real in it yet: before the fetch resolves (wrapper
     state) or before its own image has decoded (card state). */
  :where([data-avatar-state="loading"] [data-avatar-slot],
         [data-avatar-card-state="loading"]) {
    position: relative;
    overflow: hidden;
    background-color: var(--fc-skeleton-bg, rgba(255, 255, 255, 0.06));
  }
  :where([data-avatar-state="loading"] [data-avatar-slot],
         [data-avatar-card-state="loading"])::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 2;
    background-image: linear-gradient(
      100deg,
      rgba(255, 255, 255, 0) 20%,
      var(--fc-skeleton-sheen, rgba(255, 255, 255, 0.18)) 50%,
      rgba(255, 255, 255, 0) 80%
    );
    background-size: 200% 100%;
    background-repeat: no-repeat;
    animation: fc-avatar-shimmer var(--fc-skeleton-speed, 1.5s) linear infinite;
  }

  /* Hide the Designer placeholder image while shimmering, fade the real face
     in when the script adds .is-loaded. (Opacity only — glass owns transform.) */
  :where([data-avatar-state="loading"] [data-avatar-slot] [data-avatar-image],
         [data-avatar-card-state="loading"] [data-avatar-image]) { opacity: 0; }
  :where([data-avatar-image]) {
    transition: opacity var(--fc-skeleton-fade, 0.35s) ease;
  }
  :where([data-avatar-card-state="ready"] [data-avatar-image].is-loaded) {
    opacity: 1;
  }

  /* Slots the catalog hasn't populated yet: no shimmer, just muted. */
  :where([data-avatar-card-state="unavailable"], [data-avatar-unavailable]) {
    opacity: 0.35;
    pointer-events: none;
  }

  /* Pills and Next/Back while the catalog loads. Pills stay clickable. */
  :where([data-avatar-gender].is-loading, [data-avatar-race].is-loading) {
    opacity: 0.55;
    transition: opacity 0.2s ease;
  }
  :where([data-avatar-next].is-loading, [data-avatar-back].is-loading) {
    opacity: 0.45;
    transition: opacity 0.2s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    :where([data-avatar-state="loading"] [data-avatar-slot],
           [data-avatar-card-state="loading"])::after { animation: none; }
  }
</style>
```

### If your cards use liquid glass

Don't animate `border-radius` or `transform` on a `data-liquid-glass` card —
the rules above only touch `background`, `opacity` and a pseudo-element, which
is safe. If a card *is* the glass element, the `::after` sits above the glass
rendering; that's fine (it's a flat overlay), but if you'd rather shimmer under
it, put the pseudo-element on an inner wrapper instead of the card.

## Debugging

- `Flexicare.avatarPicker.report()` — per-slot table of what the API returned.
- `Flexicare.avatarPicker.prime(document)` — re-stamp the loading state by hand.
- Add `data-avatar-debug` to the wrapper for console logging.
- No shimmer at all? Check `document.querySelector("style[data-avatar-skeleton-css]")`
  exists, and that the wrapper doesn't carry `data-avatar-skeleton="off"`.
- Shimmer stuck on? The wrapper keeps `data-avatar-state="loading"` only until the
  grid renders; a card keeps `data-avatar-card-state="loading"` only until its own
  image decodes (decode errors release it too). A stuck one means the fetch never
  resolved — look for `[data-avatar-error]` / the console.
