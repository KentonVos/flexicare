# Quiz page — the loading (shimmer) state

Sibling of `docs/avatar-loading-state.md`; same pattern, same reasoning.

The problem: `/archetype` can't paint a question until `GET /quiz` (plus the
answers sync) lands. Until then the only thing on screen is the Designer's
authored content — including the one visible `[data-quiz-option-template]`
card. `flexicare-quiz.js` now covers that gap with a skeleton.

## What the script does

| Where | What | When |
|---|---|---|
| `[data-quiz]` wrapper | `data-quiz-state="loading"` → `"ready"` | from **beforeEnter** (before the incoming page is visible) until the first question paints |
| `[data-quiz-option-template]` | hidden immediately | same |
| `[data-quiz-options]` | N inert clones marked `[data-quiz-skeleton-option]` | same |
| `[data-quiz-prompt]`, `[data-quiz-helper]` | shimmer bars, text transparent | same |
| `[data-quiz-next]`, `[data-quiz-back]` | dimmed | same |

The skeleton clones are deliberately **not** options: no `data-quiz-option`
attribute (so the delegated click handler can't see them), `aria-hidden="true"`,
labels blanked, entrance attributes stripped, children `visibility: hidden` so a
checkbox dot or icon inside your card doesn't show through. They're removed in
`buildOptions()` the moment real options render, and on teardown.

## Webflow steps

1. On `[data-quiz]`, set `data-quiz-skeleton-count` = the number of options a
   question in this stage usually has (default `4`). It's cosmetic — the real
   options replace them whatever the count.
2. On `[data-quiz]`, add a static `data-quiz-state` = `loading`. On a hard load
   the footer scripts run after first paint; the script clears it.
3. Nothing to paste. The CSS ships with the script.

## Why the CSS ships with the script

**Barba only swaps the container — the `<head>` never changes.** CSS pasted into
a *page's* Custom Code exists on a hard load and is absent on every
`barba.go()` arrival, which is the "shimmer only works after a reload" bug we
already hit on the avatar page. So the script injects the stylesheet once into
the persistent head (`injectCSS()`, flagged `data-js-injected` so
`transition.js`'s shell sync skips it), same as `transition.js` does for its
FOUC rule.

Three ways to change the look:

- **CSS variables** on `[data-quiz]` (or `:root`): `--fc-quiz-skeleton-bg`,
  `--fc-quiz-skeleton-sheen`, `--fc-quiz-skeleton-speed`.
- **Override any rule.** The injected selectors are `:where()`-wrapped → zero
  specificity, so one plain rule of yours beats them without `!important`. Put
  it in the **site** head (Site Settings → Custom Code → Head), never a page's.
- **Opt out:** `data-quiz-skeleton="off"` on `[data-quiz]` — the script still
  stamps every state and builds the skeleton cards, it just injects no CSS.

### Killing the last frame on a hard load

The injected CSS can only arrive when the footer script runs, so on a **hard
load / reload** there is one paint where the states are stamped (from the static
attribute) but unstyled. If that bothers you, paste the stylesheet below into
the **site** head as well — site-head CSS *does* survive Barba (the head is
never swapped; only page-level head code is missed). The duplicate is harmless:
identical rules, zero specificity.

```html
<style>
  @keyframes fc-quiz-shimmer {
    from { background-position: -150% 0; }
    to   { background-position:  250% 0; }
  }

  :where([data-quiz]) {
    --fc-quiz-skeleton-bg: rgba(255, 255, 255, 0.06);
    --fc-quiz-skeleton-sheen: rgba(255, 255, 255, 0.18);
    --fc-quiz-skeleton-speed: 1.5s;
  }

  :where([data-quiz-skeleton-option],
         [data-quiz-state="loading"] [data-quiz-prompt],
         [data-quiz-state="loading"] [data-quiz-helper]) {
    position: relative;
    overflow: hidden;
    color: transparent !important;
    background-color: var(--fc-quiz-skeleton-bg, rgba(255, 255, 255, 0.06));
  }
  :where([data-quiz-skeleton-option],
         [data-quiz-state="loading"] [data-quiz-prompt],
         [data-quiz-state="loading"] [data-quiz-helper])::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 2;
    background-image: linear-gradient(
      100deg,
      rgba(255, 255, 255, 0) 20%,
      var(--fc-quiz-skeleton-sheen, rgba(255, 255, 255, 0.18)) 50%,
      rgba(255, 255, 255, 0) 80%
    );
    background-size: 200% 100%;
    background-repeat: no-repeat;
    animation: fc-quiz-shimmer var(--fc-quiz-skeleton-speed, 1.5s) linear infinite;
  }

  /* a checkbox dot / icon inside a skeleton card shouldn't show through */
  :where([data-quiz-skeleton-option] *) { visibility: hidden; }

  :where([data-quiz-state="loading"] [data-quiz-next],
         [data-quiz-state="loading"] [data-quiz-back]) {
    opacity: 0.45;
    transition: opacity 0.2s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    :where([data-quiz-skeleton-option],
           [data-quiz-state="loading"] [data-quiz-prompt],
           [data-quiz-state="loading"] [data-quiz-helper])::after {
      animation: none;
    }
  }
</style>
```

## Debugging

- No shimmer? `document.querySelector('style[data-quiz-skeleton-css]')` should
  return a `<style>`; check the wrapper doesn't carry `data-quiz-skeleton="off"`.
- Shimmer stuck on? The wrapper leaves `loading` when the first question paints
  (`showLoading(false)`), so a stuck skeleton means `GET /quiz` never resolved —
  check `[data-quiz-error]` and the console, or add `data-quiz-debug`.
- Skeleton cards clickable? They shouldn't be — they carry
  `data-quiz-skeleton-option`, never `data-quiz-option`.
