# The Webflow MCP connector

Claude Code can read and write the Flexicare Webflow site directly, through the
Webflow MCP connector. Connected 2026-08-27. This file is what a fresh session
needs to use it without rediscovering the traps.

---

## 1. The rule

**Reading needs no permission. Writing needs a yes, every time.**

Propose the exact edit, wait for Kenton's confirmation, then make it. Batch
related edits into one list to approve rather than confirming each attribute —
that respects the instruction without being tedious.

Three hard lines on top of that:

- **Never publish the site.** Leave changes unpublished in the Designer for
  Kenton to review, even when everything is verified and publishing looks like
  the obvious finish. `publish_site` lives in `data_sites_tool`.
- **`remove_element`, `move_element`, and branch merge/delete need their own
  explicit yes, named as such.** Approval to "fix these attributes" is not
  approval to delete anything.
- **Don't create styling properties on existing classes.** If a change needs
  CSS, create a new class (`data_style_tool > create_style`). Kenton crafts the
  visual design; the connector must not silently change a class other elements
  share.

## 2. Setup

Authorized as a claude.ai connector (`https://mcp.webflow.com/mcp`). The tools
only appear in sessions started *after* authorization, and writing also needs a
permission rule in `.claude/settings.local.json` (gitignored — this repo is
public):

```json
{ "permissions": { "allow": ["mcp__claude_ai_Webflow"] } }
```

Call `webflow_guide_tool` once per session before anything else.

## 3. Ids

Site: **Discovery Flexicare** — `6a54e16eeed40a39998fba5b`

| Page | Page id | Controller |
|---|---|---|
| `/` Home | `6a54e171eed40a39998fbb48` | landing (nav collapsed) |
| `/start` | `6a5f2613fdf8a6920c430f09` | — |
| `/onboarding` | `6a61ddeb7f41df31564fe7da` | flexicare-onboarding.js |
| `/selfie` | `6a60bd8aca652f52cf387928` | flexicare-selfie.js |
| `/avatar` | `6a86fb4607ddef4a002cf36d` | flexicare-avatar.js |
| `/archetype` | `6a63194ca30beefe75a6448b` | flexicare-quiz.js (ROUTING) |
| `/flexicare` | `6a8c0a166cbc7ab805aadb07` | flexicare-quiz.js (FLEX) |
| `/meet-your-two-selves` | `6a845c558b9b9e92b6e1b2a6` | flexicare-reveal.js |
| `/flexicare-product` | `6a8c2acb0fa9581e69c1de79` | flexicare-product.js |
| `/spin-to-win` | `6a8eb63ff4b08c0d19710342` | flexicare-spin.js |
| `/kiosk` | `6a912f2f5785c05d31e845fc` | flexicare-kiosk.js (pairing UI) |

Ids are stable, but re-run `list_pages` rather than trusting this table blindly.

## 4. Which tool does what

| Job | Tool → action |
|---|---|
| Find elements by attribute / class / type | `data_element_tool > query_elements` |
| Read a subtree | `query_elements` with `children_depth` |
| Read/write custom attributes | `data_element_tool > get_attributes` / `set_attributes` / `remove_attribute` |
| **Element id (`#id`)** | `data_element_settings_tool > set_dom_id` — **NOT** `set_attributes` |
| **HTML Embed contents** | `data_element_settings_tool > get_settings`, `key: "code"` |
| Tag / visibility | `data_element_settings_tool > set_tag` / `set_visibility` |
| Create elements | `data_element_builder` |
| Create/read classes | `data_style_tool` |
| Site head/footer custom code | `data_scripts_tool > get_site_freeform_code` / `set_site_freeform_code` |

## 5. The traps (all hit for real, 2026-08-27)

**Attribute queries cannot see inside HTML Embeds.** This produced two false
"missing required attribute" alarms in one session: the onboarding inputs
(`data-onboarding-name`, `data-onboarding-whatsapp`) and the *entire* product
copy database live in embeds. Before reporting a missing attribute, check whether
the page has an `HtmlEmbed` and read its `code` setting. Embed contents are fine
and are not to be re-flagged.

**`set_attributes` cannot write an element's id.** It fails with "An internal
error occurred" — which reads exactly like a permission problem. Use
`set_dom_id`. It normalizes the value (invalid characters stripped, spaces to
hyphens, lowercased), so camelCase ids are not possible.

**Verify by reading back, not by trusting the success message.** Several writes
return `data: null` on success. A follow-up `query_elements` is the only proof.

**`set_site_freeform_code` replaces the whole block.** Read it first, edit the
string, write it back whole. Getting this wrong takes the site down site-wide.

**`set_style` replaces an element's entire class list**, and multiple names
become combo classes.

**Don't trust a partial query as a complete answer.** A wrap attribute being
absent does not mean its inner slot is absent — querying only
`data-spin-expires-wrap` produced a wrong "the expiry line doesn't exist"
finding when `data-spin-expires` had been there all along.

## 6. What it is genuinely good at

**Auditing.** Attribute contracts per page, and the cross-page shell diff, which
had no other practical check. The one-call shell chain per page:

```
query_elements → element_filter { attribute_name: "data-barba",
                                  attribute_value: "container" },
                 return_parent: "ancestor"
```

All ten pages must return the **same 9 ancestors, same types and tags, in the
same order**; only classes may differ (that is what `syncShellClasses` handles).
One extra wrapper on one page breaks every page after the first, and the
symptoms cascade and look unrelated — see CLAUDE.md.

Finding rule violations in bulk: query `data-anim` and `data-liquid-glass` per
page and intersect — glass owns `transform`, so a glass host must use
`data-anim-fade`.

**Bulk attribute edits.** 33 writes across 9 pages in one session, zero wrong
targets, each verified by reading back.

## 7. What to keep doing by hand

**Creating and positioning elements.** The API exposes no rendered layout, so
placement is guesswork. Prefer: Kenton places the element in the Designer,
Claude sets its attributes. When an element genuinely must be created from here,
position it out of normal flow (absolute) so an empty node cannot shift layout,
and say plainly that the position is a guess to be reviewed.

**Anything visual.** Deciding whether a fade reads better than a rise is not a
call the connector can inform.

## 8. Changes made from here, still UNPUBLISHED

Everything below is in the Designer and **not on the live site until someone hits
Publish**. The connector reads the Designer; the browser shows the last publish — that
distinction has already burned one debugging round.

| When | Page / scope | Change |
|---|---|---|
| 2026-08-31 | Home | `data-journey-start="true"` moved off `<body>` onto `glass-content-wrapper` (the `data-barba="container"` element). Without it the journey reset fires on a hard load but not on a navigation. |
| 2026-09-01 | Site head | Tablet snippet's viewport string now ends `, viewport-fit=cover`. |
| 2026-09-01 | Site head | `saturate()` removed from `[data-spin-wheel]` and `[data-spin-hub]` — the last one on the site. |
| 2026-09-01 | Site head | New fifth block: kiosk touch hardening, scoped `html[data-kiosk-locked]`. |

The site head is ONE freeform block and `set_site_freeform_code` replaces it wholesale.
Read it in full, edit surgically, and diff the returned content against what you sent.
There are five blocks in it now: font smoothing, the tablet snippet, spin CSS, kiosk
pairing CSS, kiosk touch hardening.

## 9. Open items

- The spin page still carries `product-card-wrapper`, `glass-orb is-product` and
  `voucher-code-wrapper` from the product-page duplicate — asked twice, never
  confirmed as intentional.
- **⚠️ Five glass preset names in the Designer do not exist in `glass.js`.** Audited on
  `/spin-to-win` 2026-09-02: `background-glass`, `tag`, `button-glass`,
  `character-card`, `nav-container` are all in use; only `pill` is a real built-in
  (`cta`, `nav`, `panel`, `pill`). They must be **tuner-saved presets living in one
  browser's `localStorage`** — which means those elements fall back to `DEFAULTS` on
  every other device, **including the kiosk tablets**. The look would be right on the
  designer's laptop and wrong in store, with nothing on screen to say so.
  **Fix:** on the machine that has them, run `LiquidGlass.exportPresets()` and paste the
  output into `PRESETS` in `src/glass.js`. `glass.js` now warns once per unknown name in
  the console (added 2026-09-02) — before that it failed silently. Re-audit the other
  pages while you are there; only `/spin-to-win` was checked.
- `/onboarding`'s `.input-glass-wrapper` has `data-lg-preset="character-card"`
  with no `data-liquid-glass` (glass removed on purpose). The preset is inert;
  clear it during the glass sweep. Note the same class on `/spin-to-win` carries it too.
- Removed glass knobs (`data-lg-ca`, `-saturate`, `-tinthue`, `-tintamount`, `-tilt`,
  `-elevation`) are inert wherever they remain. **`/spin-to-win` was checked and has
  none**; the other pages have not been swept.
- `.spin-cooldown` on `/spin-to-win` was created from here and its position is a
  guess: bottom edge inside the square wheel stage. Restyle freely.
- Before go-live: swap the staging API base in `flexicare-core.js`, and drop
  `slider.js` / `orb-tuner.js` from the footer.
- The spin page's lead form collects **surname, ID type and ID number with no
  backend endpoint to send them to** (buffered in memory, lost on reload). The
  CTA says "Call me back". Chase the backend before go-live.
- `/spin-to-win` still has two stray `.fc-error` divs (from the copied onboarding
  component) containing the literal text "data-onboarding-error", plus an empty
  `.fc-field` div at the bottom of `form-stage`. Their attributes are stripped so
  they are inert, but the text will render — they need DELETING in the Designer
  (element removal, so it needs Kenton's explicit yes).
- `/kiosk`'s error box still holds Webflow's default div text. Harmless since
  `flexicare-kiosk.js` clears it on boot, but misleading on the canvas.
- Two combo classes created from here on 2026-08-28, both placeholders to restyle:
  `.field-glass.is-invalid` (red ring on an invalid lead field) and
  `.fc-error.is-lead-copy` (the lead error message). The red `#FF6B6B` is a guess —
  the palette is lime/indigo/teal and has no error colour.
