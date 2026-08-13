# CHANGELOG

Newest first. One entry per change you push to CodeSandbox. Keep it plain:
what changed, which file, and why. This is how a fresh session (and future you)
knows the current state without re-reading every file.

Format:
```
## YYYY-MM-DD — short title
- file(s) touched
- what changed and why
- any Webflow-side change needed (new attribute, head snippet, etc.)
```

---

## 2026-08-13 — Fix persistent siblings snapping during page transitions (v1.0.1)
- src/transition.js
- Barba inserts the next container only AFTER leave() resolves, but beginOverlap()
  pulled the leaving container out of flow at the START of leave(). For the length
  of the leave animation the shared parent (content-flex-wrapper) had a hole in it,
  so persistent siblings — top-section-wrapper above the container — reflowed into
  the vacated space and snapped back when the next container landed.
- beginOverlap() now parks a rigid, hidden placeholder (same box + margins,
  flex:0 0 auto) in the container's slot; beforeEnter() removes it the moment the
  real container is inserted. endOverlap() removes it as a backstop.
- No Webflow change needed. The placeholder carries data-barba-placeholder for
  debugging only.
- Also added _headers (Cloudflare cache rules) as part of moving hosting
  off pinned jsDelivr tags — see docs/hosting-and-publishing.md.

## 2026-08-13 — Hosting moves to Cloudflare Workers; no more footer pastes
- Added _headers, wrangler.jsonc, .assetsignore
- Renamed docs/git-and-jsdelivr.md → docs/hosting-and-publishing.md and rewrote it
- Updated CLAUDE.md + README.md to describe the new workflow
- Why: pinned jsDelivr tags meant pasting a new footer into Webflow on every
  release. Unpinning was not an option — jsDelivr serves unpinned URLs with
  max-age=604800, so returning visitors would hold stale JS for 7 days.
- Now: Cloudflare Workers serves the repo root from main, with
  Cache-Control: public, max-age=0, must-revalidate on /src/* — push and it's live.
- WEBFLOW CHANGE (one time): footer script URLs move from
  cdn.jsdelivr.net/gh/KentonVos/flexicare@vX.Y.Z/src/... to
  https://flexicare.kenton-323.workers.dev/src/... — same files, same order.
  After this paste, the footer only changes if the file LIST changes.
- main is now live on every push. Version tags still cut as a rollback escape hatch.

## 2025-08-13 — Set up repo, context docs, and move hosting to Git + jsDelivr
- Added CLAUDE.md, ARCHITECTURE.md, README.md, this CHANGELOG, .gitignore
- Captured the real Webflow head snippet in docs/webflow-head-snippet.md
- Added docs/git-and-jsdelivr.md (setup + publish + rollback)
- Moved the nine scripts into src/ as the source of truth
- Hosting moves from CodeSandbox to jsDelivr (served from GitHub, version-tagged)
- No script behaviour changed; footer URLs change to cdn.jsdelivr.net/gh/USERNAME/flexicare@vX.Y.Z/src/...
- Webflow footer: moved dev-only slider.js (tuner) to the end; order otherwise unchanged (verified correct)
