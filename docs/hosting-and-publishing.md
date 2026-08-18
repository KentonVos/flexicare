# Hosting and publishing

The GitHub repo is the single source of truth. **Cloudflare Workers** serves the files
to Webflow straight from `main`.

The mental model: **push to `main` → it's live.** No Webflow step, no version bump, no
cache guessing. Hard-refresh and you're looking at the new code.

- Repo: https://github.com/KentonVos/flexicare (public)
- Live CDN base: https://flexicare.kenton-323.workers.dev
- Example: https://flexicare.kenton-323.workers.dev/src/glass.js

---

## Day-to-day: making a change live

1. Edit the file(s) here in VS Code with Claude Code.
2. Tell Claude Code: **"commit and push."** It runs:
   ```bash
   git add -A
   git commit -m "Fix selfie retake label on Safari"
   git push
   ```
3. Cloudflare auto-deploys within ~1 minute. Hard-refresh (Cmd/Ctrl+Shift+R). Done.
4. Add a line to `CHANGELOG.md`.

**Nothing to paste into Webflow.** The footer only ever needs touching again if the
*list* of script files changes (a file added, removed, or renamed) — not when their
contents change.

We still cut version tags (`v1.0.1`, `v1.0.2`, …) on meaningful releases. They cost
nothing and they're the emergency escape hatch — see Rollback.

---

## Why it updates instantly (the `_headers` file)

`_headers` at the repo root sets, for everything under `/src/`:

```
Cache-Control: public, max-age=0, must-revalidate
```

The browser revalidates on every load and gets a tiny `304 Not Modified` when nothing
changed. Updates are effectively instant at the cost of one conditional request per file.

This matters more than it sounds. The obvious "never touch the footer" approach — an
unpinned jsDelivr URL like `@main` — serves `max-age=604800`: **returning visitors keep
stale JavaScript for seven days.** You'd ship a fix and the people already using the
funnel wouldn't get it. That's why we moved hosting rather than just unpinning the URL.

If you ever want fewer round-trips, raise `max-age` to `60`. Don't go much past that
without returning to pinned versions.

---

## The Webflow footer

Set once, in Webflow → Project Settings → Custom Code → **Footer**. Order is
load-bearing (see ARCHITECTURE.md); GSAP and Barba are libraries and stay pinned.

```html
<script src="https://cdn.jsdelivr.net/npm/@barba/core@2.10.3/dist/barba.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://flexicare.kenton-323.workers.dev/src/glass.js"></script>
<script src="https://flexicare.kenton-323.workers.dev/src/transition.js"></script>
<script src="https://flexicare.kenton-323.workers.dev/src/text-reveal.js"></script>
<script src="https://flexicare.kenton-323.workers.dev/src/background-motion.js"></script>
<script src="https://flexicare.kenton-323.workers.dev/src/orb-motion.js"></script>
<script src="https://flexicare.kenton-323.workers.dev/src/flexicare-core.js"></script>
<script src="https://flexicare.kenton-323.workers.dev/src/flexicare-selfie.js"></script>
<script src="https://flexicare.kenton-323.workers.dev/src/flexicare-onboarding.js"></script>
<script src="https://flexicare.kenton-323.workers.dev/src/flexicare-quiz.js"></script>
<!-- dev-only tuner, loaded last; gated behind ?tune in the URL -->
<script src="https://flexicare.kenton-323.workers.dev/src/slider.js"></script>
<!-- dev-only orb tuner; gated behind ?orbtune -->
<script src="https://flexicare.kenton-323.workers.dev/src/orb-tuner.js"></script>
```

Separately, the **Head** holds the `window.__fcLayout` snippet, which is NOT in this repo
and is unaffected by any of this. See `docs/webflow-head-snippet.md`.

---

## Rollback

Live is now whatever is on `main`, so rollback is a Git operation:

```bash
git revert HEAD      # undo the last commit as a new commit
git push
```

Live again in ~1 minute. Use `git revert`, not `git reset`, on a pushed branch.

**If the site is badly broken and you want it fixed *now*,** every version tag we ever
pushed is still permanently served by jsDelivr. Point the Webflow footer at a known-good
tag and publish:

```
https://cdn.jsdelivr.net/gh/KentonVos/flexicare@v1.0.0/src/glass.js
```

That's instant and bypasses Cloudflare entirely. Remember to put the footer back to the
`workers.dev` URLs once the fix is in — otherwise the site is frozen at that tag and
future pushes will silently do nothing, which is a genuinely confusing state to debug.

---

## The trade we made

| | Pinned jsDelivr tags (old) | Cloudflare `main` (now) |
|---|---|---|
| Publish a change | Push, paste footer, republish Webflow | Push |
| Live delay | Instant | ~1 min build + revalidate |
| Rollback | Edit one character in footer | `git revert && git push` |
| Staging buffer | Yes — commit now, publish later | No — `main` is live |

If you want the staging buffer back, work on a branch: Cloudflare builds every branch to
its own preview URL, and merging to `main` is then the deliberate "go live" step.

---

## Cloudflare setup (already done — for reference)

The project is a **Worker** with static assets, not a Pages project. Two files make it work:

- **`wrangler.jsonc`** — tells `wrangler deploy` that the assets directory is the repo
  root (`./`), so `src/glass.js` is served at `/src/glass.js`. Without this the deploy
  fails with *"Could not detect a directory containing static files"*.
- **`.assetsignore`** — keeps `.git`, docs, and `*.md` off the CDN. Verified: those paths
  return 404.

Build settings in the Cloudflare dashboard: production branch `main`, no build command,
deploy command `npx wrangler deploy`.

---

## Rules

- The repo is **public** — never commit API keys, tokens, or passwords.
- Test on the **published or preview URL**, not the Designer — the camera (selfie page)
  and Barba both need a real `https` page.
- The API base URL in `flexicare-core.js` is still **staging**
  (`api-staging-discovery.injozitech.com`) and must be swapped before go-live.
