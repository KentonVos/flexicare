# Reveal page — the loading (shimmer) state

Sibling of `docs/quiz-loading-state.md` and `docs/avatar-loading-state.md`; same
pattern, same reasoning.

The problem: `/meet-your-two-selves` paints the Designer's **placeholder copy**
the moment it appears, and the real copy only lands once the archetype is known.

- Arriving by `barba.go()` from the quiz that's a microtask — the quiz page
  already ran `POST /routing/preview`, so `Flexicare.archetype` is set and the
  swap is invisible.
- On a **hard reload or a deep link** it's a chain of requests:
  `GET /sessions/{id}` → (if the archetype isn't on the session)
  `GET /quiz` → `POST /routing/preview`. Seconds of lorem-ipsum-looking
  template text sitting there as if it were the user's own result.

The generated image pair has the same gap: `GET /sessions/{id}/images` is polled
every ~2.5s until `READY`, so on the selfie path the two cards are empty (or
showing a placeholder) for a while. (On the avatar path the first poll is already
`READY` — see `docs/api-contract.md` §3.8.)

## What the script does

| Where | What | When |
|---|---|---|
| `[data-reveal]` wrapper | `data-reveal-copy-state="loading"` → `"ready"` | from **beforeEnter** (before the incoming page is visible) until the real copy is in |
| every copy-database slot target | `data-reveal-skeleton` → shimmer bar, text transparent | same |
| `[data-reveal-name]`, `-archetype-label`, `-echo` | same | same |
| `[data-reveal-copy]` embed | hidden immediately | same |
| `[data-reveal-next]` | dimmed (still clickable) | same |
| each image's frame | `data-reveal-skeleton-frame` → shimmer | until `data-reveal-state` leaves `loading` |
| `[data-reveal-image]` | `data-reveal-image-pending` + inline `opacity: 0` | until its real file has decoded |

**The placeholder image has to be hidden, not just covered.** Webflow ships
`[data-reveal-image]` with a placeholder asset, and the shimmer sheen is
semi-transparent — laid over a grey placeholder photo it still reads as a photo.
So each pending image gets `data-reveal-image-pending` and an **inline**
`opacity: 0` (inline, so no Webflow class or interaction can outrank it). It
keeps its box, so nothing reflows; `setImage()` reveals it the instant the real
file has decoded. If the pair never arrives, `clearImageSkeleton()` puts the
placeholder back — a page with no `[data-reveal-images-fallback]` must not end
up blank.

Two independent clocks, on purpose: the copy skeleton clears when the archetype
resolves, the image skeleton when the pair is `READY` (or the fallback shows).
The page never blocks on either.

**Which text slots get marked** is derived from the copy database itself, not
hard-coded: `allSlotNames()` reads every `data-copy="…"` in every
`[data-reveal-copy]` block — for *all* archetypes, since the archetype isn't
known yet — and resolves each to its target the same way `paintDatabaseCopy()`
does (Webflow ID first, then `[data-reveal-slot="…"]`). Add a slot in Webflow and
it shimmers with no script change.

**Order matters at the end.** The skeleton is cleared *after*
`paintDatabaseCopy()` and `paintCopy()`, never before — the slots are still
`color: transparent` while they're being written, so the real text is revealed
already correct instead of flashing the placeholder for a frame. It is also
cleared on the archetype-failure branch and in `teardown()`, so it can never get
stuck on.

## Webflow steps

Nothing is **required** — the script marks everything from attributes that are
already on the page. The optional knobs:

1. On `[data-reveal]`, add static `data-reveal-copy-state` = `loading` and
   `data-reveal-state` = `loading`. The script clears both.

   `markSkeleton()` runs at **script-execution time** (not `DOMContentLoaded`), so on a
   hard load the shimmer is in place as early as a footer script can manage — otherwise
   the placeholder copy paints first and the sequence reads "copy, then shimmer, then the
   real copy", with the placeholder flashing past as if it were the answer. That closes
   most of the gap but not all of it: CSS in the `<head>` is the only thing that applies
   at first paint. If you still catch a flash, pair the static attribute above with this
   in **Site Settings → Custom Code → Head** (the skeleton CSS itself ships with the
   script, so this is only about the pre-JS frames):

   ```html
   <style>
     [data-reveal-copy-state="loading"] #with-cover-heading,
     [data-reveal-copy-state="loading"] #without-cover-heading,
     [data-reveal-copy-state="loading"] #with-cover-text,
     [data-reveal-copy-state="loading"] #without-cover-text { color: transparent }
   </style>
   ```
2. Set the `[data-reveal-copy]` embed's wrapper to **display: none** in the
   Designer. The script hides it, but only once it runs — on a hard load the raw
   copy blocks are briefly visible otherwise.
3. `data-reveal-image-frame` on the wrapper *around* a `[data-reveal-image]`, if
   the image's own parent isn't the box you want shimmering (the script falls
   back to `parentNode`, which is usually right; reach for this when the parent
   is the whole card).
4. `data-reveal-no-skeleton` on any element that should be left alone — most
   likely the inline `", Lerato"` span, if you'd rather it stayed blank than
   flickered mid-headline.
5. `data-reveal-skeleton-target` on any extra element you want shimmered that
   the auto-marking doesn't cover.
6. `data-reveal-skeleton="off"` on `[data-reveal]` turns the whole thing off,
   CSS inject included, and you style the two state attributes yourself.
7. Nothing to paste. The CSS ships with the script.

Tune the look with custom properties on `[data-reveal]` — no `!important`
needed, the injected selectors are `:where()`-wrapped and carry zero
specificity:

```css
[data-reveal] {
  --fc-reveal-skeleton-bg: rgba(255, 255, 255, 0.06);
  --fc-reveal-skeleton-sheen: rgba(255, 255, 255, 0.18);
  --fc-reveal-skeleton-speed: 1.5s;
  --fc-reveal-skeleton-radius: 0.35em;
}
```

## Why the CSS ships with the script

**Barba only swaps the container — the `<head>` never changes.** CSS pasted into
a *page's* Custom Code exists on a hard load and is absent on every
`barba.go()` arrival. That's the "shimmer only works after a reload" bug we hit
on the avatar page, and it's why `injectCSS()` puts the stylesheet into the
persistent head once, flagged `data-js-injected` so `transition.js`'s shell sync
leaves it alone.

If the one unstyled paint on a hard reload bothers you, the same rules can also
go in the **site** head (site-head CSS *does* survive Barba). The duplicate is
harmless — identical rules, zero specificity. Copy them out of `SKELETON_CSS` in
`src/flexicare-reveal.js`.

## Debugging

- No shimmer? `document.querySelector('style[data-reveal-skeleton-css]')` should
  return a `<style>`; check the wrapper doesn't carry `data-reveal-skeleton="off"`.
- Want to look at it? `Flexicare.reveal.skeleton()` re-marks everything on the
  live page. Reload to clear it.
- Only the images shimmer, not the copy? The copy skeleton is derived from the
  database — if `[data-reveal-copy]` is missing or its slot names don't match any
  element ID / `[data-reveal-slot]`, there's nothing to mark. `Flexicare.reveal.copy("A")`
  dumps what the database resolves to.
- Copy shimmer stuck on? The archetype never resolved — check `[data-reveal-error]`
  and the console, or add `data-reveal-debug`.
- Placeholder image still showing? It should carry `data-reveal-image-pending`
  while it waits — if it doesn't, it's not inside `[data-reveal]`, or it already
  has `is-loaded` on it, or it carries `data-reveal-no-skeleton`.
- Image shimmer stuck on? The poll never left `GENERATING`; it gives up at
  `data-reveal-timeout` (default 90s) and falls through to the fallback, which
  clears it.
