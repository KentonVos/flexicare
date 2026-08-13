# Git + jsDelivr: hosting and publishing

This replaces the old CodeSandbox hosting. The repo on GitHub is the single source of
truth; **jsDelivr** serves the files to Webflow straight from GitHub. No more copy-paste,
and Claude Code can do the whole publish for you.

The mental model: **push a version tag → paste the new footer into Webflow once → done.**
Version tags are permanent and update instantly (no cache guessing).

---

## One-time setup

You do the account/auth steps once; after that Claude Code runs the git commands.

1. **GitHub account** — sign up at https://github.com if you don't have one.
2. **Install Git** — Mac: it's usually there (`git --version`; if not, run `xcode-select
   --install`). Windows: https://git-scm.com/download/win.
3. **Install GitHub CLI (`gh`)** — https://cli.github.com. This handles login so you never
   deal with tokens/passwords.
4. **Log in once:** in the terminal run `gh auth login` → choose GitHub.com → HTTPS →
   "Login with a web browser" → paste the code it shows. Done.

**Repo must be PUBLIC.** jsDelivr only serves public GitHub repos. That's the same exposure
you already have (CodeSandbox served these files openly too), and there are no secrets in
this code — the API URL is a public staging endpoint and the session id is created at
runtime, never stored in the files. **Rule going forward: never commit API keys, tokens,
or passwords to this repo.**

---

## Step 0 — check what's already set up (Mac; you've used Git before)

You've used Git in VS Code before, so some of this may already be done. Run these checks
first and only fix what's missing — don't reinstall things that already work.

```bash
git --version                    # Git installed? (Macs usually have it)
git config --global user.name    # your name for commits — must NOT be blank
git config --global user.email   # your email for commits — must NOT be blank
gh --version                     # GitHub CLI installed?
gh auth status                   # logged in to GitHub via gh?
```

Fixes for anything missing:
- **`user.name` / `user.email` blank** (commits need an identity):
  ```bash
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
  ```
- **`gh` not found:** `brew install gh` (or download from https://cli.github.com).
- **`gh auth status` says not logged in:** `gh auth login` → GitHub.com → HTTPS →
  "Login with a web browser" → paste the code.

Important: being signed in to GitHub *inside VS Code* (the account menu) is NOT the same
as `gh` being authenticated — you can have one without the other. `gh auth status` is the
source of truth for the command-line flow below. If you'd rather not use `gh`, you can
create the empty repo on github.com yourself and add the remote manually, but `gh` is the
smoother path and the rest of this doc assumes it.

## First push (Claude Code can run all of this)

From inside the `flexicare` folder:

```bash
git init
git add .
git commit -m "Initial commit: Flexicare custom code + context docs"
gh repo create flexicare --public --source=. --remote=origin --push
git tag v1.0.0
git push origin v1.0.0
```

Your files are now live at (replace `USERNAME`):

```
https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/glass.js
```

---

## The new Webflow footer

Swap your CodeSandbox footer for this. Keep GSAP and Barba as-is (they're libraries, not
your code — I've pinned Barba to a version so a future major release can't surprise you).
Replace `USERNAME` and keep the `@v1.0.0` matching whatever tag you last pushed.

```html
<script src="https://cdn.jsdelivr.net/npm/@barba/core@2.10.3/dist/barba.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/glass.js"></script>
<script src="https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/transition.js"></script>
<script src="https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/text-reveal.js"></script>
<script src="https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/background-motion.js"></script>
<script src="https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/flexicare-core.js"></script>
<script src="https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/flexicare-selfie.js"></script>
<script src="https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/flexicare-onboarding.js"></script>
<script src="https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/flexicare-quiz.js"></script>
<!-- dev-only tuner, loaded last; gated behind ?tune in the URL -->
<script src="https://cdn.jsdelivr.net/gh/USERNAME/flexicare@v1.0.0/src/slider.js"></script>
```

(This is your existing order, which is correct, with the tuner moved to the end.)

---

## Day-to-day: making a change live

1. Edit the file(s) here in VS Code with Claude Code.
2. Tell Claude Code: **"commit, tag the next version, and push."** It runs, e.g.:
   ```bash
   git add -A
   git commit -m "Fix selfie retake label on Safari"
   git tag v1.0.1
   git push && git push origin v1.0.1
   ```
3. Claude Code gives you the footer block with the new tag (`@v1.0.1`). Paste it into
   Webflow → Project Settings → Custom Code → Footer, replacing the old block. **Publish.**
4. Add a line to `CHANGELOG.md`.

That's it. Because the tag is new, jsDelivr serves the new files instantly — no cache wait,
no purge, no mystery. The only manual steps are the Webflow paste + Publish (unavoidable —
that's the boundary Claude Code can't cross).

Version numbers: bump the last digit for small fixes (`v1.0.1`, `v1.0.2`), the middle for
bigger changes (`v1.1.0`). It's just a label; the only rule is never reuse one.

---

## Rollback (the big payoff)

If a release breaks the site, point the footer back at the previous tag (change `@v1.0.1`
to `@v1.0.0`) and Publish. Instantly back to the known-good version — no code changes, no
panic. The old tag still exists forever.

---

## Caching truth table (why we use tags)

| URL style | Updates when you push? | Reliable? | Use for |
|---|---|---|---|
| `@v1.0.1` (exact tag) | new tag = new URL, instant | yes, permanent | **production (this is the plan)** |
| `@main` (branch) | after ~12h, or a flaky purge | no | quick solo testing only |
| `@latest` / `@1` (floating) | delayed, cached | no | avoid |

If you ever want to test a change without cutting a tag, you *can* use a `@main` URL, but
expect up to a 12-hour delay before it updates, and don't trust it for anything you're
showing someone. Cut a tag when it matters.

Optional purge for a `@main` URL (works on the edge, not always the origin):
`https://purge.jsdelivr.net/gh/USERNAME/flexicare@main/src/glass.js`

---

## Optional later: one request instead of ten

jsDelivr can bundle files into a single response with its `combine` endpoint, which is a
small speed win. It's more fiddly to debug when something breaks, so it's not worth it yet
— note it for when the funnel is stable.
