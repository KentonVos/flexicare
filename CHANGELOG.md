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
- Also added _headers (Cloudflare Pages cache rules) as part of moving hosting
  off pinned jsDelivr tags — see docs/git-and-jsdelivr.md.

## 2025-08-13 — Set up repo, context docs, and move hosting to Git + jsDelivr
- Added CLAUDE.md, ARCHITECTURE.md, README.md, this CHANGELOG, .gitignore
- Captured the real Webflow head snippet in docs/webflow-head-snippet.md
- Added docs/git-and-jsdelivr.md (setup + publish + rollback)
- Moved the nine scripts into src/ as the source of truth
- Hosting moves from CodeSandbox to jsDelivr (served from GitHub, version-tagged)
- No script behaviour changed; footer URLs change to cdn.jsdelivr.net/gh/USERNAME/flexicare@vX.Y.Z/src/...
- Webflow footer: moved dev-only slider.js (tuner) to the end; order otherwise unchanged (verified correct)
