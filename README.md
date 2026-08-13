# Flexicare custom code

Custom JavaScript for the Flexicare Webflow funnel. This folder is the **source of truth**;
it's a Git repo pushed to GitHub and served to Webflow by jsDelivr via `<script src>`.

## First-time setup

1. Install **VS Code**, then install **Claude Code** (`npm install -g @anthropic-ai/claude-code`
   or follow https://docs.claude.com/en/docs/claude-code/overview). Node.js is required.
2. Install **Git** and the **GitHub CLI** (`gh`), then run `gh auth login` once. Full
   walkthrough (including the first push) is in `docs/git-and-jsdelivr.md`.
3. Put this whole folder somewhere permanent (e.g. `~/projects/flexicare`).
4. Open the folder in VS Code (`File → Open Folder`).
5. Open the terminal (`View → Terminal`) and run `claude` from inside the folder.
6. Claude Code reads `CLAUDE.md` automatically at the start of every session, so a fresh
   chat already knows the project. For deep work, tell it to read `ARCHITECTURE.md` too.

## Day-to-day

- Ask Claude to make a change. It edits the file here.
- Ask Claude to **commit, tag the next version, and push** — it runs the git commands.
- Paste the footer block Claude gives you into the Webflow footer and Publish.
- Add a line to `CHANGELOG.md`.

See `docs/git-and-jsdelivr.md` for the full publish/rollback workflow.

## Map

```
flexicare/
├── CLAUDE.md          ← auto-read every session; the short brief
├── ARCHITECTURE.md    ← deep reference (read on demand)
├── CHANGELOG.md       ← running log of what you pushed
├── README.md          ← this file
├── docs/
│   ├── webflow-head-snippet.md   ← the head snippet that lives in Webflow (site head)
│   └── git-and-jsdelivr.md       ← hosting + publish + rollback workflow
└── src/               ← the nine scripts (served by jsDelivr from /src/)
    ├── glass.js
    ├── transition.js
    ├── text-reveal.js
    ├── background-motion.js
    ├── flexicare-core.js
    ├── flexicare-onboarding.js
    ├── flexicare-selfie.js
    ├── flexicare-quiz.js
    └── slider.js       ← liquid-glass tuner (dev-only, ?tune)
```

The `src/` path and filenames must match the jsDelivr URLs in the Webflow footer exactly
(`.../flexicare@vX.Y.Z/src/glass.js`). Rename a file only if you also update the footer.
