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
| `/what-is-flexicare` | `6af47ef580b5faf83d35ccdb` | — (static; CTA is a page link to `/archetype`) |
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

**`set_text` rejects a div — target its String child (2026-11-11).** Most copy on
this site is a Block (`div`) holding a `String` node, and `set_text` on the Block
fails with "This element doesn't support text". Pass the String node's id instead
(the one with `textContent` in a `children_depth` query). Headings and Spans accept it
directly. Inline structure survives: editing only the String before a Span (the green
"You get smart.") or after a Link (the consent T&Cs link) leaves those intact.

**`data_element_builder`'s `set_text` does NOT apply to a TextBlock.** The block is
created with Webflow's default "This is some text inside of a div block." — and the
success message says nothing. Create, then `set_text` the new String child, then read
back. `data_whtml_builder` has no such problem, keeps `data-*` attributes, and reuses
an existing class when the name matches (no "name 2" duplicates when no `css` is sent).

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

**2026-11-12 08:37 UTC: phase 2 published to the STAGING subdomain only** (`publish_site` with `publishToWebflowSubdomain: true`, `customDomains: []`). The custom domains `flexi-play.co.za` / `www.` still carry **the 2026-09-15 07:24 (SAST) publish** — `data_sites_tool > get_site`,
`lastPublished`. Everything dated up to 2026-09-14 below has therefore SHIPPED; it is
kept as history. Pending as of 2026-11-11: the phase 2 rows, plus a Designer edit on
Home dated 2026-10-16 that was not made from here.

**Phase 2 copy rewrite — ON STAGING, NOT LIVE (2026-11-11/12).** Source: Matte BLK "Copy Rewrite v3".
Push `src/flexicare-spin.js` (`hasLeadForm()`) before publishing — the lead form's
removal depends on it.

| Page | Change |
|---|---|
| `/` | Badge → "Quality healthcare can be expensive. Flexicare is different." Headline → "See what private health cover actually looks like for you." NEW sub-line "60 seconds. No paperwork." (`text-size-large`, `data-text-reveal`, `data-anim="3"`) after the headline. CTA → "Show me". |
| `/start` | Headline → "One has Flexicare. One doesn't." Sub → "Same person. Two very different outcomes. Use your face or pick an avatar, we'll show you both." |
| `/avatar` | NEW sub-line "This is the face we're building your Flexicare story around." under the headline (the PDF says under the grid; the grid fills its column, so it sits in the heading column). |
| `/onboarding` | Badge "Before we start." · headline "Where should we send your Flexicare recommendation?" · sub "We'll WhatsApp your personalised Flexicare match after the quiz. A Discovery advisor may follow up to walk you through your options." (verbatim — consent touchpoint 1) · consent tail " and confirm I'm happy for Discovery to contact me about my Flexicare recommendation." (T&Cs link untouched) · CTA "Start the quiz" · `data-onboarding-next` → `/what-is-flexicare`. **2026-11-12:** NEW empty `[data-onboarding-form-error]` (`onboarding-form-error`, `role="alert"`) after `consent-wrapper` — the page had no form-error element at all before. | **2026-11-18:** third gender pill `fc-gender-opt` "Prefer not to say", `data-gender="prefer_not_to_say"`, `data-liquid-glass="true"` like the other two, after Male.
| `/what-is-flexicare` | **NEW PAGE** (id `6af47ef580b5faf83d35ccdb`), duplicated from `/onboarding` (9-ancestor shell verified), form + tag removed. Headline, sub, two glass cards (`what-points` / `what-point` / `what-point-text`, `data-lg-preset="panel"`). Nav: Back → `/onboarding`, CTA "See what cover could look like for you" → page link `/archetype` (all `data-onboarding-*` hooks stripped). Typos in the PDF fixed: "could like" → "could look like", "specialists visits" → "specialist visits". | **2026-11-12 REDESIGN (published to STAGING 2026-11-12 10:03 UTC, not live):** rebuilt on the product page card to Kenton's mock-up — ONE glass card (`product-card-wrapper is-what` inside a new `what-is-wrapper`) holding the tag "What is flexicare? +" (green `+` = `is-green` span), the headline (`heading-style-product-heading is-what`, 4.75em at tablet so it sits on two lines), "Flexicare covers:" (`what-covers-heading`), a six-item check list (`product-list-item is-what` > `check-wrapper is-what` + check2.svg asset, `what-list-text`) and the R445 / FlexiFund line (`what-body`), plus the product page's three glows and its glass orb (`product-orb-wrapper is-what`, all its `data-orb-*` copied, sat lower: `bottom:-38%` at tablet). The sub "Most people assume…" is not in the mock-up and is gone. The container is now `glass-content-wrapper product`, like the product page. **The old content (`onboarding-container` with `what-points`) is HIDDEN, not deleted** (visibility off) — delete it, and the three `what-point*` classes, on Kenton's yes. No controller hooks (`data-product-*`, `data-reveal-skeleton-target`) were copied, so `flexicare-product.js` stays off this page.
| `/archetype` | `data-quiz-next-text-last="Show me my match"` (was "See your 2 selves"); `data-quiz-back="/what-is-flexicare"` (Back on Q1). |
| `/meet-your-two-selves` | Panel tags → "Without Flexicare" / "With Flexicare". Both `[data-reveal-next]` CTAs → "See my Flexicare match". Headline unchanged (already "Meet your two selves, [Name]"). |
| `/flexicare-product` | Headline String → "The version of you with Flexicare doesn't get lucky. " (green span kept). NEW sub-line (`text-size-large is-product-sub`). CTA stays "Spin to Win". Badge unchanged. (A QR section was built and then REMOVED on 2026-11-12 — see §11.) |
| `/spin-to-win` | NEW badge `tag-wrapper is-spin-badge` > `glass-tag` > "Your Flexicare match is confirmed." above the headline. Headline → "Now spin for your prize." `[data-spin-go-text]` → "Spin to Win with Flexicare, administered by Discovery Health". **`form-stage` (`data-spin-when="form"`) REMOVED** with all its fields (and the stray `.fc-error` / `.fc-field` divs §9 asked about). **2026-11-12:** `data-spin-labels="off"` on the wrapper (blank slices), and a NEW `[data-spin-when="whatsapp"]` QR panel shown after every spin instead of the prize — §11. New class `whatsapp-qr-frame`. | **2026-11-18:** QR frame deleted, panel copy rewritten (§11).

New classes (no existing class was edited): `is-product-sub` (combo on
`text-size-large`), `is-spin-badge` (combo on `tag-wrapper`), `what-points`,
`what-point`, `what-point-text`. 2026-11-12 redesign + logo: `what-is-wrapper`,
`what-covers-heading`, `what-list-text`, `what-body`, `top-center-wrapper`,
`discovery-logo`, and combo `is-what` on `product-card-wrapper`, `product-wrapper`,
`product-list-item`, `check-wrapper`, `product-orb-wrapper` and
`heading-style-product-heading`.

**Discovery logo in the top bar — ALL 13 shell pages, 2026-11-12 (published to STAGING
2026-11-12 10:03 UTC, not live).** New asset `discovery-logo.svg` (`6af58a4e30ac59bce64af709`, white
wordmark + mark, 221×44). On every page, `flexi-top-wrapper` now has THREE children:
`top-left-wrapper` (Flexicare logo), NEW `top-center-wrapper` > `img.discovery-logo`
(alt "Discovery"), `top-right-wrapper` (tagline). `flexi-top-wrapper` is
`space-between`, so the logo sits in the gap between the other two. Width 9.25rem
(5.5rem on phones, where it fits with the tagline wrapping to two lines). This is
SHELL: `walkShellClasses()` matches the top bar child-by-child, so the logo must stay
on every page in the same position — a page without it misaligns the sync for every
page loaded after it. Pages: `/`, `/start`, `/onboarding`, `/what-is-flexicare`,
`/selfie`, `/avatar`, `/archetype`, `/flexicare`, `/meet-your-two-selves`,
`/flexicare-product`, `/spin-to-win`, `/kiosk`, `/terms-and-conditions` (404/401/style
guide have no shell). Any NEW page must be duplicated from one of these. (The six `qr-*` classes were created and then deleted
with the QR section.)

**History (all shipped in the 2026-09-15 publish):**

| When | Page / scope | Change |
|---|---|---|
| 2026-08-31 | Home | `data-journey-start="true"` moved off `<body>` onto `glass-content-wrapper` (the `data-barba="container"` element). Without it the journey reset fires on a hard load but not on a navigation. |
| 2026-09-01 | Site head | Tablet snippet's viewport string now ends `, viewport-fit=cover`. |
| 2026-09-01 | Site head | `saturate()` removed from `[data-spin-wheel]` and `[data-spin-hub]` — the last one on the site. |
| 2026-09-01 | Site head | New fifth block: kiosk touch hardening, scoped `html[data-kiosk-locked]`. |
| 2026-09-02 | `/spin-to-win` | `data-spin-when="ready spinning"` moved off `spin-stage` onto its new parent `spin-stage-wrapper`, so the new `spin-heading-wrapper` H1 hides with the wheel instead of staying on screen over the prize panel. `data-spin-stage` stayed on `spin-stage`. |
| 2026-09-14 | `/terms-and-conditions` | **NEW PAGE** (id `6aa7e971351baec82b46ed60`), duplicated from `/start` so the 9-ancestor shell matches, then `/start`'s `character-grid-wrapper` removed and the full Flexicare T&Cs built inside the container. See §10. |

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
- ~~The spin lead form's surname/ID fields had no endpoint~~ and ~~the stray
  `.fc-error` / `.fc-field` divs in `form-stage`~~ — both moot: the whole form panel was
  removed on 2026-11-11 (phase 2, Kenton's explicit instruction). `data-spin-lead-label`
  is still on the spin wrapper; it is inert without a form panel and is what the CTA
  says in state `form` if one is ever put back.
- `/kiosk`'s error box still holds Webflow's default div text. Harmless since
  `flexicare-kiosk.js` clears it on boot, but misleading on the canvas.
- Two combo classes created from here on 2026-08-28, both placeholders to restyle:
  `.field-glass.is-invalid` (red ring on an invalid lead field) and
  `.fc-error.is-lead-copy` (the lead error message). The red `#FF6B6B` is a guess —
  the palette is lime/indigo/teal and has no error colour.

## 10. The Terms and Conditions page (built 2026-09-14)

`/terms-and-conditions` — page id `6aa7e971351baec82b46ed60`. Operator/compliance
page holding the Flexicare product terms verbatim from the supplied PDF.

**How it was built.** `create_page` with `duplicateOf: /start`, which is the only
reliable way to get the 9-ancestor Barba shell exactly right (same trick as `/kiosk`
from `/onboarding`). `/start`'s `character-grid-wrapper` was then removed from inside
`data-barba="container"` and the document built with `data_whtml_builder`.

**Attributes on the Barba container** (`glass-content-wrapper`):
- `data-kiosk-enforce="off"` — **load-bearing.** The pairing gate is on by default and
  redirects every tokenless arrival to `/kiosk`. Without this nobody can read the terms
  on an unpaired phone or a compliance reviewer's laptop.
- `data-progress` was **removed** (it was `"1"` on `/start`). `updateProgress` returns
  early when the attribute is absent, so opening the terms mid-journey now leaves the
  progress bar where it was instead of slamming it to 100%.
- No `data-journey-start` — reading the terms must never reset a shopper's run.

**Structure.** `terms-page` → `terms-header` (h1 + lede) + `terms-scroll` → `terms-doc`,
which holds 32 `terms-section` blocks (clauses 1–30, Annexure A, Privacy Statement) plus
a `terms-footnote` carrying the two regulatory disclaimer paragraphs.

**New classes, all `terms-*`** — no existing class was touched, per the rule in §1:
`terms-page`, `-header`, `-title`, `-lede`, `-scroll`, `-doc`, `-section`, `-h2`, `-h3`,
`-lead`, `-l1`, `-l2`, `-l3`, `-note`, `-footnote`, `-fineprint`.

Two deliberate choices in that CSS:
- **Colour is inherited, never set.** The palette is variable-driven and muted text on
  this site is done with `opacity` (`.text-style-muted` is `opacity: 0.6`), so the terms
  classes follow that convention rather than hardcoding a hex that would be wrong the
  moment the palette moves.
- **Hanging indents, not nested elements.** Each clause is ONE `<p>` using
  `padding-left` + negative `text-indent`, which is why 250-odd numbered clauses did not
  become 750 Webflow elements. `terms-l1/l2/l3` are separate standalone classes rather
  than combos, and the indents shrink at the 767px breakpoint.

**Scrolling works on the kiosk tablets.** The touch-hardening block scopes
`overscroll-behavior: none` to `html[data-kiosk-locked]`, which only stops scroll
*chaining*; `touch-action: manipulation` keeps pan. `terms-scroll` adds
`overscroll-behavior: contain` of its own.

**Still open on this page:**
- ~~Nothing links to it.~~ **DONE 2026-09-14** — the `/onboarding` consent label now
  carries an inline Text Link on "Terms & Conditions" (page link, not a URL, so it
  survives a slug change), and the terms page's nav CTA goes back to `/onboarding`.
  That CTA lives in `button-navigation-wrapper`, which is OUTSIDE the Barba container,
  but `data-barba-sync="nav"` means `syncRegions()` replaces its innerHTML from the
  incoming page — so the terms page's own button is what is on screen there.
  **This required a code change:** see `src/flexicare-onboarding.js` `onClick`. The
  consent branch preventDefaults every click inside `[data-onboarding-consent]`, and
  the label is inside it, so the link both toggled consent and refused to navigate.
  - **Still open: the round trip empties the form.** `init()` sets `state.consent =
    false` on every `afterEnter`, and Barba rebuilds the container, so the name and
    WhatsApp `<input>`s come back blank. A shopper who types their details, taps the
    terms out of diligence and comes back has to start again. Nothing buffers those
    fields today (`FC.avatarGender` is the only thing carried in). Fix would be to
    buffer name/whatsapp/gender on `FC` and restore them in `init()` — deliberately
    NOT consent, which should stay a fresh act after reading.
- The spin lead form also collects personal information under these terms and has no
  link to them yet.
- The page has two `h1`s: the shell's "Health Cover. Your Way" (which sits in
  `top-right-wrapper`, OUTSIDE the Barba container, so it is on every page) and
  `terms-title`. Matches what `/start` already does; flagged rather than changed.
- The scroll region's height comes from the glass card, which is `height: 100%` all the
  way up. It reads correctly in the tree but has NOT been seen rendered — check it in
  preview at tablet and phone width before publishing.

## 11. The WhatsApp QR — moved from the product page to AFTER THE SPIN (2026-11-12)

**2026-11-18: THE QR IS GONE.** WhatsApp now fires automatically when `POST /spin`
succeeds, so the `whatsapp-qr-frame` element (and its class) was deleted from
`/spin-to-win` on Kenton's instruction, and the panel copy became: tag "Check your
WhatsApp", heading "Your result is on its way", body "We've sent your spin result to the
WhatsApp number you gave us. It should arrive in a few seconds. If you've won, show the
message to a Flexicare promoter in store to collect your prize." The voided panel's
heading lost `data-spin-prize-name` (the API no longer sends a prize name) and reads
"This reward is no longer valid" / "Please ask a Flexicare promoter in store for help."
Same day, after Kenton's staging test: the gap the QR left is filled by a WhatsApp
icon (asset `whatsapp-icon.svg` `6afd5f33606cf082f38051cf`, new class `whatsapp-icon`:
9rem wide, 6.5rem on phones, centred), placed where the QR frame was.

Everything below is history.


**History.** The PDF's Screen 11 put a QR on `/flexicare-product` ("Scan first. Then
spin."). It was built 2026-11-11 and removed 2026-11-12 (element + six `qr-*` classes;
the product CTA went back to "Spin to Win").

**The flow now (client update, 2026-11-12):** the shopper completes the whole journey and
taps Spin to Win. The wheel spins and lands — with **blank slices**, so the landing does
not reveal the prize — and then, for **every** outcome (a win or "not this time"), the
spin page shows a QR that opens WhatsApp. The shopper sends the pre-filled message; the
bot matches the sender's number to the one captured at `/onboarding` and replies with
the prize. Nothing is shown on screen about what they won.

**Webflow (`/spin-to-win`, UNPUBLISHED):**
- `data-spin-labels="off"` on the `[data-spin]` wrapper (`spin-wrapper`). Slice icons
  were already off (`data-spin-icons` defaults to off). Slice COLOURS still show — if
  the admin colours the consolation slice differently (the demo data makes it grey),
  that slice alone gives a "no prize" landing away.
- NEW panel, last child of the wrapper, id `3db2dcb6-…-661c681b7d2f`:
  `spin-panel is-prize [data-spin-when="whatsapp"]` > `spin-card` (glass) >
  `spin-prize-content-wrapper` (tag "One last step", `spin-card_prize` "Your result is
  waiting on WhatsApp", **`whatsapp-qr-frame`** (new class, 11rem white square — EMPTY),
  `spin-card_body` "Scan with your phone camera and send the message that opens. Use the
  phone with the WhatsApp number you gave us, and we'll reply with your result.") +
  `btn-wrapper` > Done (`[data-spin-done="/"]`) + the two `green-win-glow`s. All classes
  reused from the prize card except the frame. The copy is a placeholder written here —
  not from the client.
- The pre-boot rule in the site head (`[data-spin]:not([data-spin-state])
  [data-spin-when]`) already hides the new panel until the script picks a state.

**Code (`flexicare-spin.js`):** `paintAward()` sends every award to state `whatsapp`
when `hasPanel("whatsapp")`; the award is still written into the (hidden) prize panels,
so deleting the whatsapp panel restores the on-screen prize card with no code change.
`isAwardState()` includes `whatsapp`, so the kiosk heartbeat still reports `prize`.

**To finish:** put ONE Image in `whatsapp-qr-frame` — a QR of the bot's `wa.me` link
(number + pre-filled message), supplied by the WhatsApp/bot team. Upload the PNG as an
asset and `set_image_asset`, or drop it in the Designer.

**Known weak point of a fixed QR:** the bot can only match the shopper if they scan
with the phone whose number they typed at onboarding. The other half — the number
actually being saved — is covered since 2026-11-12: onboarding retries the phone PATCH
and will not move on until it lands (`sendPhone()`), showing its message in the new
`[data-onboarding-form-error]` (class `onboarding-form-error`) under the consent row.
