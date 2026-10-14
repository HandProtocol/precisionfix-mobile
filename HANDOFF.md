# Handoff: PrecisionFix · 2026-09-15 (booking calendar added 2026-09-16)

Owner-editable site for **PrecisionFix**, a factory-certified Mercedes-Benz
mobile mechanic in Austin TX (owner: Alex, alexb04.uti@gmail.com; bilingual
EN/ES). Rebuilt from his old one-page site at percesionfix.netlify.app (that
URL's "percesion" is a typo; the business is PrecisionFix) on the HAND client
engine with the `hand-client-site` skill.

**Status:** LIVE at https://precisionfix-austin.netlify.app since 2026-09-15
(Netlify site `9f248232-981f-4a15-a891-a62f949f92fa`, account cryptokoh;
`precisionfix.netlify.app` was taken by a stranger, hence `-austin`). Code
also lives in the private repo **https://github.com/HandProtocol/precisionfix-site**
(the owner's phone Claude Code works against that repo). Nothing in the
monorepo is committed.

**2026-09-17 checkpoint: LIVE** (`assetVersion` `20260917a`, deploy
`6aac3af92e2dc1f6115115f8`; to roll back, republish
`6aab30174ca4af1b8e337215` in the Netlify UI, the new column is harmless to
the old code). koH: "show me the changes or just push them". Shipped by CLI
after a draft deploy and **after** migration 048 (applied + recorded); the
order and the probes used are at the top of `clients/_template/HANDOFF.md`.
Verified on production: the dial and no `<img>` in the hero at 1440 and 390,
both radios 18px, 26 open days from the API, the bookings queries answer
(manage 404, act 303 `link-used`, feed 404 on a bad token),
`/api/content` says `viewer: public`, `booking-reminders` registered. Not
done this time: a signed-in pass through the Bookings tab. The bookings table
was empty at ship time. The mirror repo is still stale.

- **The hero carries no photo any more.** The client did not want the Porsche
  leading the page. `site/page.mjs gauge()` draws an inline SVG tachometer in
  the `.hero__media` slot (class `hero__gauge`, `aria-hidden`, no image bytes);
  the base styles are in `public/assets/site.css` and every look restyles the
  same drawing through `--g-*` variables in its theme sheet: redline = a lit
  dial right of the wordmark (amber needle, red zone glowing), chrome = a gold
  hairline ring around the centered copy (numerals and needle hidden on
  desktop: inside a centered layout they can only land on text), blueprint =
  a drafted FIG. 01, sunset = the tilted card, terminal = a phosphor
  `TACH_01 //` frame. The needle sweeps to the redline once and settles at
  idle (177deg); under reduced motion it is simply still. On phones redline
  and chrome move the dial into the flow under the badge, cropped to its top
  half: behind the copy it collided with the paragraph. Looked at by eye:
  redline 1440 / 1024 / 390, chrome 1440 / 390, blueprint / sunset / terminal
  1440, sunset 390. Measured on all five: no overflow at 320, the dial inside
  the viewport, still and visible under reduced motion, EN/ES caption, zero
  console errors. Not yet seen by eye: blueprint and terminal on a phone, and
  the four non-redline looks at 1024.
- **What Featured means now:** only the share-preview image (`og:image` +
  JSON-LD). The gallery follows sort order, not the featured flag. The Setup
  checklist's photo item was reworded to match. **The Porsche is still the
  first gallery tile (full width on redline) and still the share image**; if
  the client wants it gone entirely, reorder or Replace it in the Media tab,
  or change the seed in `site.config.mjs`.
- **Text / Call radios in the booking form** were stretched by
  `.field input{width:100%}` (87px and 91px wide, so each dot sat at a
  different offset). Fixed in `.choice input`, all five looks.

**2026-09-15 late checkpoint.** Owners added: alexb04.uti@gmail.com (Alex)
and cryptokoh@gmail.com, as rows in `command.precisionfix_editors` plus
`PRECISIONFIX_OWNER_EMAILS` on the Netlify site. The Setup checklist gained
item 12, "Create your Supabase account" (standalone repo commit `ed0bf52`).
Deployed by CLI; see the GitHub bullet under "Where things are" for the state
of the git link.

**2026-09-16 checkpoint: Setup tab rework (engine).** Every Setup step is
now a button (`actions`: jump to a field, section, tab, the live site, or an
external link), items tick themselves where the site can tell (`check`:
owner email in, Search Console code pasted, custom domain live), ticks save
on the spot (`PATCH /api/admin/content`, no Publish), done tasks collapse,
and the first item embeds the **Looks picker**: five swatch cards, a
full-screen preview of the real site in that look inside the editor, and
**Use this look** publishes in one tap. The old "type ?theme= in the
address bar" instruction is gone. Deployed by CLI, verified live signed in
(see "Verified live 2026-09-16"), standalone repo commit `190e156`. The
content row now exists (`source: db`, theme `redline`, every tick false),
because the verification switched looks and back.

**2026-09-16 evening: test-booking button fixed.** The Setup task "Send
yourself a test booking" opened `/admin/#book` (a second editor tab) because
`site` actions were `window.open`-ed relative to the admin page. Engine fix
(see `clients/_template/HANDOFF.md`): `site` targets are root-relative and
rendered as links. Redeployed by CLI, `assetVersion` `20260916b`, verified
signed in: the button now opens `https://precisionfix-austin.netlify.app/#book`
in a new tab. The verification minted and consumed one login token for
hand@handprotocol.org; content untouched (theme `redline`, ticks false).
Standalone repo commit `0ae6429` (pushed as cryptokoh; the git link still
does not build, deploy stays CLI).

**2026-09-16 night: booking calendar live (phase 1, `request` mode).** The
Netlify Form is gone (`public/forms/booking.html` deleted, `forms` removed
from `site.config.mjs`, the form handler removed from `site.js`). `#book`
now renders the engine's calendar (`site/booking.mjs` → `B.bookingBlock()`):
service (from the Services list) → day → window (Morning 8–11, Midday 11–2,
Afternoon 2–6, clipped to the hours) → the person, the car (year / make /
model / mileage / VIN), where the car is (address + a city from Service
area), what it is doing → **Request this time**. Requests land in
`command.precisionfix_bookings` (migration 047, applied) and the owner
confirms them in the new **Bookings** tab of `/admin/` or from the
one-tap **Confirm / Decline** links in the notification email; the customer
gets got-your-request, confirmed (+ `.ics`), new-time, declined, cancelled
and a reminder the day before. Owner hours live under Content → **Booking
calendar** (defaults Mon–Fri 8–6, Sat 9–3, 4 hours notice, 30 days ahead).
Setup tab has 14 items now: **Set your hours and days off**, **Send
yourself a test booking** (ticks itself once a booking carries an owner's
email), **Put your bookings on your phone's calendar**. Deployed by CLI,
`assetVersion` `20260916c`, verified live end to end (see "Verified live
2026-09-16 night"). **The mirror repo was NOT synced or committed**
(koH said do not commit): run the rsync recipe under "Where things are",
then commit + push there as cryptokoh, before Alex edits from his phone.

## Start here (cold session)

1. Read this file, then `README.md` (owner section on top, engine doc below).
2. Site pack = `site.config.mjs`, `site/themes.mjs`, `site/checklist.mjs`,
   `site/booking.mjs`, `site/schema.mjs`, `site/page.mjs`,
   `public/assets/site.css`, `public/assets/themes/*.css`,
   `public/assets/site.js`, `public/img/photos/*`, `tests/page.test.mjs`.
   Everything else is engine: fix in `clients/_template`, then
   `sync-engine.mjs precisionfix`.
3. `npm test` (92 tests, no DB). Preview a theme:
   `node scripts/render-static.mjs --theme=sunset` → `dist-preview/sunset/`.
   Screenshots: Playwright from gstack with `--no-sandbox`; add `.in` to every
   `.reveal` before a full-page capture or sections look empty.

## What was built

- **Five themes** the owner switches in `/admin/` → Content → Site → Theme
  (live on publish) and anyone previews with `?theme=<id>`: `redline`
  (default; the old site's black/red/amber DNA), `blueprint` (engineering
  paper, navy + international orange), `chrome` (graphite + champagne serif
  over the full-bleed photo), `sunset` (cream, coral→gold, stickers,
  polaroids), `terminal` (phosphor-green diagnostic console). One DOM in
  `site/page.mjs`; each theme is its own stylesheet + palette + fonts.
  Redline's palette is also the editor's and the emails'.
- **Bilingual**: every visible line has an `_es` twin in the schema;
  `data-es` swap in `site.js`, auto-picks Spanish browsers, EN/ES pill in the
  nav (owner can hide it: Site → language switch).
- **Booking calendar** (`#book`, since 2026-09-16): the engine's request
  calendar (`site/booking.mjs`, engine `lib/booking*.mjs`). Customer: service
  → day → window → person + car + where + what it is doing → Request. Owner:
  Bookings tab (Requested with overlap chips → Confirm / Confirm at another
  time / Decline; Confirmed by day → Reschedule / Completed / No-show /
  Cancel / Note / `.ics`; Past; Declined and cancelled; Add a booking; Block
  a day; month strip; Add to my phone's calendar) or the one-tap links in
  the email. Recipients: `PRECISIONFIX_BOOKING_NOTIFY` →
  `PRECISIONFIX_FORM_NOTIFY` (still hand@handprotocol.org) →
  `PRECISIONFIX_OWNER_EMAILS`. Hours / days off / windows / notice / horizon
  / jobs-per-day / the two customer lines: Content → Booking calendar
  (engine section `calendar`, PrecisionFix defaults in `site/booking.mjs`).
  Payments: not built (checklist item "Take deposits", later).
- **Setup tab in `/admin/`** (engine feature, `config.checklist` →
  `site/checklist.mjs`): 14 phone-first tasks. Each has action buttons (the
  button is the step), a why, fallback prose, "rather have HAND do it", and
  a done-when; the theme task embeds the Looks picker; `copy`,
  `search_console` and `domain` tick themselves (`check` on
  `contact.email`, `seo.google_verification`, the served host). Ticks live in
  the content doc (hidden `setup` section) and save the moment they change.
  Items: theme, copy + phone + email, photos, hours and days off, test
  booking (self-ticking), phone calendar, GitHub account, connect Claude
  Code, Supabase account, Namecheap nameservers, Search Console, Google
  Business Profile, retire the old site, deposits (later).
  `DOMAIN` in `site/checklist.mjs` is a placeholder until the owner tells us
  the domain.
- **Photos**: the five cars from the old site, seeded (Porsche featured).

## Engine additions made for this site (in `clients/_template`, synced)

`select` field type; `hidden` sections; `config.checklist` + Setup tab
(`lib/checklist.mjs`, admin.js/css); `config.forms` + `lib/forms.mjs` +
`submission-created.mjs`; `headTags({ theme, fonts })` overrides +
`google_verification` meta; `renderPage({ url })` + `Netlify-Vary: query=theme`;
`sitemap.mjs`; `render-static.mjs --theme=`; provision `--site-name=`.
Legacy Care + Three Hands Healing were synced and their tests pass; bump
their `assetVersion` + redeploy when convenient (admin.js/css changed).

## Who can sign in (all `owner` role)

| Email | Who |
|---|---|
| hand@handprotocol.org | HAND operator inbox, seeded by migration |
| alexb04.uti@gmail.com | Alex, the owner. Row inserted 2026-09-15 (management API) |
| cryptokoh@gmail.com | koH. Row inserted 2026-09-15 |

Both are also in `PRECISIONFIX_OWNER_EMAILS` on the Netlify site, which
auto-provisions them as owners if the rows are ever deleted. Nobody has signed
in yet (`last_login_at` is null on every row).

## Where things are

- **Code:** `clients/precisionfix/` (monorepo working copy) and
  `~/Documents/precisionfix-site` (clone of the private repo; the deploy
  source once git-linked). Keep them in step:
  `rsync -a --exclude .git --exclude node_modules --exclude dist-preview --exclude 'public/img/placeholder' clients/precisionfix/ ~/Documents/precisionfix-site/`
  then commit + push there (and the reverse after owner edits land).
- **Database:** HAND Supabase `vconmgerblqbworcqkvr`, tables
  `command.precisionfix_editors / login_tokens / content / media / revisions`;
  migration `command/supabase/migrations/046_precisionfix.sql`, applied: **yes** (2026-09-15), 5 media rows.
- **Storage:** public bucket `precisionfix`.
- **Netlify:** project `precisionfix-austin`, id above, cryptokoh. Env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM,
  PRECISIONFIX_SESSION_SECRET, PRECISIONFIX_SITE_NAME, PRECISIONFIX_FORM_NOTIFY,
  PRECISIONFIX_OWNER_EMAILS (cryptokoh + alexb04.uti, set 2026-09-15).
- **GitHub:** HandProtocol/precisionfix-site (private, org-owned), linked to
  the Netlify site (installation 108354379, branch `main`, publish `public`,
  no build command). **Pushes do not deploy.** The cryptokoh Netlify account
  is on the Free plan, whose `deploy_private_corp_repos` capability is off:
  Free cannot git-deploy private repos owned by a GitHub organization, so
  every push webhook creates a deploy that dies in under a second with
  "Unsupported repository type." (four pushes on 2026-09-15/16) while the
  site keeps serving the last good deploy. The link-time build and one
  `POST /sites/<id>/builds` after re-sending the repo object with its GitHub
  `id` (1372230595) did go `ready`, so manual API builds may work, but do not
  rely on it. Until koH picks a fix (make the repo public; move it to
  cryptokoh's personal account, where private repos deploy on Free; or a paid
  plan), deploy by CLI from the monorepo copy:
  `cd clients/precisionfix && NETLIFY_AUTH_TOKEN=<cryptokoh token> netlify deploy --prod --build --skip-functions-cache --site 9f248232-981f-4a15-a891-a62f949f92fa`
  then check `GET /sites/<id>/deploys`. The Setup checklist's Claude Code
  item still promises "the site updates itself about a minute later"; that is
  only true once the link deploys.
- **Custom domain:** owner has a Namecheap domain (name unknown). Plan:
  Netlify DNS zone first, relay the four nameservers to the owner (checklist
  item), then `custom_domain` + `www` alias, update `productionUrl`, redeploy.

## Why the site stays under HAND's Netlify + a HAND-owned repo

The functions carry the shared Supabase service-role key. On the owner's own
Netlify account he could read it and reach every `command.*` table, so the
site stays on cryptokoh; the owner gets `/admin/` (everything content), the
repo (collaborator, for Claude Code on his phone), and the emails. He does
not need Netlify access. Netlify Forms submissions are visible only to HAND
in the dashboard; the Resend email is his copy.

## Verified live (2026-09-16 night, booking calendar)

- `/` serves the widget (`data-booking`, `/booking/booking.js?v=20260916c`),
  `/api/booking/days` lists 26 open days with `morning / midday / afternoon`,
  `/forms/booking.html` is 404, cross-origin POST is 403, bad manage / feed
  tokens 404, a bad act link 303s to `/admin/?toast=link-invalid#bookings`.
- Playwright at 390 wide: picked Brake Service, the first open day, Morning,
  filled the form as booking-test@handprotocol.org, **Request this time** →
  thank-you with "You asked for: Thursday, September 17 · Morning (8:00 AM
  to 11:00 AM) · Brake Service" and the manage link; zero console errors.
  Both Resend sends returned ok (owner to hand@handprotocol.org, customer).
- Signed in as hand@handprotocol.org (minted token): tab order
  `bookings(1), setup(14), content, media, editors, history`; the card showed
  the car, where, notes, tel / sms / mailto; **Confirm** → Confirmed, toast
  "Confirmed. The customer has been emailed."; `.ics` download 200
  text/calendar; feed link `webcal://…/calendar.ics?t=…`; Setup:
  **Set my hours** → Content tab, hours list in view, first dropdown
  focused; **Open Bookings** on the phone-calendar item → Bookings tab.
- A second request (JSON POST) declined through a one-tap link derived from
  the site's session secret: 303 to `/admin/?toast=declined&booking=…#bookings`,
  `act_token_hash` cleared, reuse → `link-used`. The manage page for the
  first request showed "Request sent" then status Confirmed with Cancel /
  Ask for another time.
- Cleanup: both test rows deleted; `precisionfix_bookings` is empty; the
  content row untouched (`source: db`, redline, every tick false).

## Verified live (2026-09-16, Setup tab rework)

Signed in as hand@handprotocol.org with a minted token, Playwright at 390 and
1440 wide, zero console errors, no horizontal overflow:

- First sign-in lands on the Setup tab; the tab sits first in the bar while
  work is left; progress reads "n of 12 done · next: …".
- Preview opens `/?theme=<id>` inside the editor and the frame renders that
  `data-theme`; Use this look publishes it (`/` served the new theme within a
  second, save bar stayed hidden, the theme task ticked); ‹ › step through
  looks; the live look's Use button is hidden and the overlay says "This is
  your live look".
- A manual tick survived a reload without Publish; unticking works; done
  tasks collapse to one line and expand on tap.
- "Check the phone number" switched to Content and focused `contact.phone`;
  the Content tab's Site section shows the same five-card picker.
- Left the site on Redline with every tick false, as Alex should first see it.

## Verified live (2026-09-15)

- `/` 200, `data-theme="redline"`, no Netlify badge, owner link, theme block;
  `?theme=sunset` → sunset, `?theme=bogus` → redline; `Netlify-Vary: query=theme`.
- `/admin/` 200 (Redline-themed login); `/api/content` ok, `source=defaults`,
  5 media rows; `/api/auth/me` 401.
- `/sitemap.xml` 200 with the current host; `/forms/booking.html` 200.
- Netlify Forms: `booking` registered with 18 fields after enabling detection.
- Git link: a build triggered from the repo went `new → building → ready`,
  the home page still served, the form stayed registered.
- Playwright (`--no-sandbox`): every theme at 1440 and 390 wide, zero
  console errors, zero horizontal overflow. Contact sheets were sent to koH.
- Not yet exercised live: an actual form submission → the two Resend emails
  (unit-tested with a mocked Resend; do the real one when signed in), a
  magic-link sign-in on this site, a photo upload.

## Known gaps and risks

- **Mirror repo stale** (2026-09-16 night): `HandProtocol/precisionfix-site`
  does not have the calendar yet; rsync + commit + push (as cryptokoh) is
  owed. Pushes still do not deploy (Free plan); deploy stays CLI.
- `contact.email` (shown on the page) is still empty and
  `PRECISIONFIX_FORM_NOTIFY` still = hand@handprotocol.org (booking
  notifications read `PRECISIONFIX_BOOKING_NOTIFY` first, then this one). The owner's address
  is known now (alexb04.uti@gmail.com) but booking notifications have not been
  switched to him; flip the env var (comma list, the HAND inbox can stay on it)
  when koH says so. Booking emails come from HAND's Resend
  sender (`EMAIL_FROM` copied from ZeroBlur); a sender on his own domain is a
  later nicety (DNS records on Netlify DNS).
- Netlify Forms no longer used by this site (the calendar replaced it);
  `submission-created.mjs` still ships with the engine for sites with
  `config.forms`. The 100-submissions cap is gone with it.
- Booking emails to a customer without an email address are skipped
  (`emailed: false` in the editor's toast says "no email on file"); the
  owner texts. Rate limit: six requests per IP per hour.
- The hero wordmark comes from `hero.headline` split on newlines
  ("Precision\nFix"); if the owner types one line the second, colored line
  disappears (by design, but tell him).
- Redline's "BOOK NOW" watermark is decorative CSS `content`, so it is not
  translated; the rest of the page is.
- Legacy Care + Three Hands Healing received the engine sync (admin.js/css
  changed) but have not been redeployed; bump their `assetVersion` and
  redeploy with `--skip-functions-cache` when convenient. Their tests pass.
- `clients/precisionfix/.netlify/` is the CLI's state dir (gitignored); the
  standalone repo excludes it.

## Message to send the owner (ready: his email is an owner row)

> Your new site is live at https://precisionfix-austin.netlify.app (it moves
> to your own domain next). Open https://precisionfix-austin.netlify.app/admin/
> on your phone, type your email (alexb04.uti@gmail.com), tap the link we
> send you: that is the editor. Start with the **Setup** tab: tap a look to
> see your site wearing it and **Use this look** to make it live; set your
> hours; then send yourself a test booking from the site. Requests show up
> in the **Bookings** tab and in your email with a Confirm button; the
> customer gets the confirmation with a calendar file. Every line is yours
> to change, in English and Spanish. Send me your Namecheap domain name and
> your GitHub username when you have them, and the email you used for
> Supabase once that step is done.

## Next steps

1. Owner email is done (alexb04.uti@gmail.com: owner row + env). Still ask
   Alex for: the domain name (→ `DOMAIN` in `site/checklist.mjs`, DNS zone),
   his GitHub username (→ collaborator on the repo), which theme he likes,
   and the email he used for Supabase. Switch `PRECISIONFIX_FORM_NOTIFY` to
   him when koH says so.
2. Sync the mirror repo (rsync recipe above), commit + push as cryptokoh.
   Then send Alex the message above; watch the first real request land.
3. Domain (Phase 5 of the skill), then Search Console with the owner.
4. Commit `clients/precisionfix/`, the migration, the template changes, and
   the skill changes when koH asks.

## 2026-10-13: engine fixes LIVE, booking notices now reach the owner

Deploy `6ace81c5088367cc2266663c` (draft `6ace81a590b6d72aa481d584` probed first: manage page 404 on a bad token, security headers present), `assetVersion` `20261013a`, no migration. Nine fixes from the 2026-09-30 engine reviews (backend 1, 2, 3, 4, 5, 8, 9, 25; UX 1, 2, 3): one-tap links open a confirm page and POST, "has been emailed" only when true with a "Text Ana" fallback, owner mail first with two retries, stale-status 409, the confirm prompt runs, no raw database errors, cancel reason reaches the customer, calendar opens on the first open month, three security headers. Full list and verification: `koordi/docs/reports/2026-10-13-engine-fixes.md`. **`PRECISIONFIX_BOOKING_NOTIFY` was unset until today: requests went only to hand@handprotocol.org. Now `alexb04.uti@gmail.com,hand@handprotocol.org`** (set 2026-10-13, live with this deploy). Only this session's 19 engine files were copied in; the site is still behind the template by the 2026-09-21 review page and its dependency (a full sync is koH's call). The used-link check now returns a 200 page, not a 303.

## 2026-10-14: conversion + search pass (NOT deployed, NOT committed)

Built in the monorepo copy only; `assetVersion` bumped to `20261014a`. Deploy by
CLI when koH says (nothing under `netlify/` changed, so no
`--skip-functions-cache`). Mirror repo still owed.

- **Conversion.** A reassurance line under the hero buttons (`hero.trust`,
  "·"-separated, each item swaps EN/ES on its own). A **Booking prompts**
  section (`cta`): a band after Services (headline with the accent second
  line, one line, Book + Call, small print) and a one-line strip after the
  gallery (the whole strip is the link; `cta.strip_button`). **What happens
  next** (`booking.steps`, 3 steps) in the booking column under the contact
  block. A **Questions** section (`faq`, 7 Q&As, native `<details>`, numbered
  like the others, between Area and Book). The phone call bar now appears as
  soon as `.hero__cta` leaves the screen (was 55% of the hero) and ducks
  behind the open menu (`body.menu-open`). Everything owner-editable in
  Content, EN/ES, styled per look in `public/assets/themes/*.css`.
- **Search.** The wordmark H1 carries the eyebrow as sr-only text
  ("Precision Fix — Austin, TX · Mobile Mechanic"). JSON-LD AutoRepair gains
  `telephone` in E.164, `address` (from `contact.location`),
  `openingHoursSpecification` (from the calendar hours), `hasOfferCatalog`
  (the Services list); a second `FAQPage` block from `faq.items`;
  `og:locale` en_US + alternate es_US; `og:image:alt`.
- **Tests:** 127 (two new in `tests/page.test.mjs`). Looked at by eye: band,
  strip, FAQ, steps and hero on all five looks at 1440, Sunset + Redline at
  390; no horizontal overflow, zero console errors. The DB content row has
  none of the new keys yet, so the live page falls back to these defaults
  until Alex edits them.
- **Still the owner's / koH's call:** Google Business Profile and a review
  link (`contact.google_review_url`), Search Console + sitemap submit, the
  domain. No analytics is installed (no GA4 / Plausible), so conversion
  cannot be measured until one is picked.
- The Design canvas "PrecisionFix Auto — site design" (claude.ai) mirrors
  the rendered Redline page as a desktop and a phone page artboard;
  regenerate from `dist-preview/redline/` when the design changes.

## 2026-10-14 (later): the $50 deposit, built, NOT deployed

Decision (koH): requesting a time stays free; when Alex confirms, the
customer pays a **$50 deposit** that comes off the bill; refunded only if
Alex cancels (customer cancel / no-show keeps it). On Alex's own Stripe
account, through Stripe Checkout (hosted page, no card form on the site).
Engine work: lives in this client's `netlify/functions/` copy; **lift it into
`clients/_template` before the next sync** (new engine files
`lib/stripe.mjs`, `lib/booking-deposit.mjs`, listed in ENGINE_FILES).

**What is in the code**

- `site/booking.mjs` `deposit: { amount: 5000, currency: 'usd', hold_hours: 24, credited: true }`
  (normalized in `lib/config.mjs normalizeDeposit()`). The deposit only acts
  when `PRECISIONFIX_STRIPE_SECRET_KEY` is set (`depositEnabled()`); without
  it every path is the pre-deposit behaviour, so the code can ship before the
  keys exist. The site copy, however, already says "$50 deposit" (steps, FAQ,
  form note, trust line): **deploy copy + code only once the keys are in**, or
  the page promises a deposit the flow never asks for.
- Flow: confirm (editor, one-tap link, or Confirm at another time) → the
  row gets `deposit_status=due`, `deposit_due_by=now+24h`; the confirmation
  email gains a "Lock it in" block with **Pay the $50 deposit** →
  `GET /booking/pay?t=<manage token>` → 303 to a Stripe Checkout session
  (success → `/booking/manage?t=…&paid=1&cs={CHECKOUT_SESSION_ID}`, which
  checks the session itself and shows "Deposit received"). Stripe's webhook
  `POST /api/booking/stripe` (`checkout.session.completed`, signature
  checked, 5-minute replay window) marks `paid`, stores the payment intent,
  emails the customer ("Deposit received") and the owner ("Deposit paid:
  …"). All idempotent (`updateBooking … ifDeposit: 'due'`).
- Owner **Cancel** of a paid deposit → `POST /v1/refunds` → `refunded`;
  the cancel email says the refund is on its way. Stripe refusing the refund
  still cancels and the toast says to refund from the Stripe dashboard.
  Customer cancel from the manage page / **No-show** → `kept` (the manage
  page's cancel confirm says so first). **Completed** leaves `paid`.
- Hourly (`booking-reminders.mjs` → `nudgeOverdueDeposits()`): a confirmed
  booking past its 24-hour hold with the deposit still due → one email to the
  owner ("Unpaid deposit: …"). Never an automatic cancel; the time stays
  on the books and Alex decides.
- Bookings tab: a Deposit chip (due · held until / overdue / paid / paid
  (in person) / refunded / kept), **Deposit paid in person** (cash, Zelle)
  and **Refund deposit** buttons, and the tab's info line says "Deposit on
  confirm: $50 through Stripe" or "Stripe is not connected yet". Bookings
  Alex adds by hand owe the deposit too when the customer has an email
  (`deposit: false` in the POST body waives it).
- Setup checklist item `payments` is now "Connect Stripe for the $50
  deposit" (no longer `later`).
- Tests: `tests/booking-deposit.test.mjs` (13; Stripe mocked like Resend),
  **140 total, all green.**

**To go live**

1. Alex creates the Stripe account (checklist item); when active he sends
   the **Secret key** (`sk_live_…`). Set on the Netlify site:
   `PRECISIONFIX_STRIPE_SECRET_KEY`.
2. In his Stripe dashboard → Developers → Webhooks → add endpoint
   `https://precisionfix-austin.netlify.app/api/booking/stripe` (move it to
   the custom domain later) for the event `checkout.session.completed`;
   set its signing secret as `PRECISIONFIX_STRIPE_WEBHOOK_SECRET`.
3. Migration: `node scripts/gen-migration.mjs --deposit --out=../../command/supabase/migrations/049_precisionfix_deposit.sql`
   (idempotent `add column if not exists` ×10 + an index). **Apply BEFORE
   deploying**: PostgREST rejects a select naming an unknown column, which
   would fail every bookings query.
4. Deploy by CLI (`--skip-functions-cache`: functions changed), then a
   test booking end to end with Stripe test keys first if you want
   (`sk_test_…` + a test-mode webhook): confirm → Pay → card 4242 → manage
   page says received → cancel from the editor → refund shows in Stripe.
5. Tell Alex: refunds take 5–10 business days to show on the customer's
   card; a deposit paid in cash is marked with the button, not through Stripe.

Not done: a reminder to the *customer* about an unpaid deposit (only the
owner is nudged); deposits in the owner's `.ics` feed; a Stripe Connect /
HAND-platform-fee model (the money is 100% Alex's, HAND bills separately).

## 2026-10-14 (later still): phone menu in the handprotocol.org style

koH: "use handprotocol.org menu style". The phone menu is now a **dropdown
card under the header** (frosted, bordered, rounded, a scrim behind it; tap
outside / Escape / a link / growing past 900px closes it) instead of the
full-screen takeover, and **Book a visit stays in the phone header** next
to EN/ES and the round ✕ toggle (the brand name hides under 900px to make
room; the mark stays). The card's bottom row is Call / Text (Book is
already in the bar). Styled per look in the theme sheets (Redline: mono
uppercase links on dark glass; Blueprint: hard-shadow plate; Sunset:
white card; Terminal: `> ` prompts). `site.js`: no more body scroll-lock,
`#menuscrim` added. Looked at by eye at 390: Redline, Blueprint, Sunset.
Tests 140 green. Not deployed.

## 2026-10-14 (evening): phone layout pass

koH saw the form radios "out of place" on the phone artboard in the Design
canvas; on a real 390px viewport they are fine. **The canvas artboard was the
culprit**: a 390px frame inside a wide window, so `max-width` media queries
never fired and it showed the desktop layout squeezed. Fixed in the canvas
generator (phone artboard now carries the phone rules unconditionally).
Real bugs found and fixed meanwhile, all five looks checked at 320 / 390 /
430 with a Bebas-width stand-in font (Google Fonts is blocked from the
sandbox, so the fallback sans overstates the wordmark by ~45%):
- The hero wordmark could run past the screen (`5rem` floor = 80px). Phones
  now size it by the copy column (`container-type: inline-size` on
  `.hero__copy`, `17.5cqw` in Redline, scaled floors in the others) and
  `.hero__copy > * { max-width: 100% }` guards the rest.
- Chrome's centred `.hero__copy` collapsed to 0 wide: `width:100%`.
- 320px header: tighter Book button + EN/ES pill; under 360px the pill hides
  (the Book button wins). Call bar buttons get `min-width:0` + ellipsis.
- Redline's "BOOK NOW" watermark peeked over the red band's top on phones:
  contained, centred.
Not verified by eye with the real fonts: do that on the draft deploy.

## 2026-10-14 (night): the booking funnel, built, NOT deployed, NOT committed

koH: the site's form becomes the funnel koordi ships, on the site's own
backend. `assetVersion` `20261014b`. Tests **145 green**. Clicked through
with Playwright on the static preview (API stubbed): redline 1440, terminal
1024, sunset 390, EN and ES, zero console errors, no overflow.

- **Flow** (`lib/booking-form.mjs`, `public/booking/booking.js` + `.css`): a
  rail of four steps (Day and time, Your details, Sent, Your car) beside one
  panel that slides in on a step change (still under reduced motion; a
  compact row above the panel under 760px). Done steps show a tick and
  their summary; "Day and time" is a button back while on the details.
  **No service pick**: `site/booking.mjs` names one service (`visit`,
  "Mobile visit"), rendered as a hidden field. Details: name, phone or email
  (one required, server too), Text / Call, address + city, an optional
  neutral note. **Nothing about the car or what is wrong before sending.**
  Pricing box right above the button (`lib/booking-pricing.mjs`, from
  `deposit.amount` + `booking.pricing { hourly: 15000, surcharge: 2000 }`):
  "A $50.00 deposit holds your time and goes toward the first hour
  ($150.00): $100.00 more when we arrive, then $150.00 each hour after." and
  "A $20.00 gas surcharge is added." (ES verbatim from koH). Heading after
  sending: **Request sent** + "Nothing is set until the owner confirms."
- **After sending** (`lib/booking-car.mjs`): "Which car is it?" (VIN or the
  year, make, model; Share / No thanks) posts
  `POST /api/booking/manage?t=<manage token> { action: 'share', vin, car_model }`;
  then "Anything you have noticed? (optional)" under the verbatim notice +
  the "I have read the notice above and agree" box; `{ action: 'share',
  issues, self_report_ack: true }`. The server refuses issues without the
  agreement (400 "Tick the box to send what you noticed."), stores
  `self_report_notice = 'self-report-2026-10-14'`, never changes status,
  never emails. Closed requests: 409. Same-origin and token checks as the
  other manage actions; the honeypot, rate limit and headers are untouched.
- **Owner side**: Bookings tab card rows VIN / Car / What they noticed /
  "Agreed to the self-report notice (self-report-2026-10-14)"; the same
  rows in `bookingRows()` (one-tap page, every later email, `.ics`). The
  **owner_new email cannot carry the car**: it goes out at creation, before
  the car is shared. The one-tap Confirm page is rendered at tap time, so it
  shows it. Not built: a second owner email on share.
- **Migrations, apply BEFORE deploy** (PostgREST rejects an unknown column
  in the `SELECT`): `command/supabase/migrations/052_precisionfix_deposit.sql`
  (the deposit columns from the earlier session, never written until now)
  and `053_precisionfix_booking_car.sql` (`vin`, `car_model`, `issues`,
  `self_report_ack`, `self_report_notice`; `npm run migration -- --car`).
  Then deploy with `--skip-functions-cache`.
- The intake fields (year / make / model / mileage / VIN) are gone from the
  form and from Add a booking by hand; the owner writes the car in the note.
- Engine files touched here (lift into `clients/_template` with the deposit
  work): `booking.mjs`, `lib/booking-form.mjs`, `lib/booking-db.mjs`,
  `lib/booking-email.mjs`, `lib/config.mjs`, new `lib/booking-car.mjs` +
  `lib/booking-pricing.mjs` (in ENGINE_FILES), `public/booking/*`,
  `public/admin/admin.js`, `scripts/gen-migration.mjs`, tests.
