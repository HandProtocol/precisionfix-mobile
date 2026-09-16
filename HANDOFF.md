# Handoff: PrecisionFix · 2026-09-15

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

**2026-09-15 late checkpoint.** Owners added: alexb04.uti@gmail.com (Alex)
and cryptokoh@gmail.com, as rows in `command.precisionfix_editors` plus
`PRECISIONFIX_OWNER_EMAILS` on the Netlify site. The Setup checklist gained
item 12, "Create your Supabase account" (standalone repo commit `ed0bf52`).
Deployed by CLI; see the GitHub bullet under "Where things are" for the state
of the git link.

## Start here (cold session)

1. Read this file, then `README.md` (owner section on top, engine doc below).
2. Site pack = `site.config.mjs`, `site/themes.mjs`, `site/checklist.mjs`,
   `site/schema.mjs`, `site/page.mjs`, `public/assets/site.css`,
   `public/assets/themes/*.css`, `public/assets/site.js`,
   `public/forms/booking.html`, `public/img/photos/*`, `tests/page.test.mjs`.
   Everything else is engine: fix in `clients/_template`, then
   `sync-engine.mjs precisionfix`.
3. `npm test` (46 tests, no DB). Preview a theme:
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
- **Booking form** (`#book`): person, contact preference, car (year/make/
  model/mileage/VIN), service (the Services list feeds the dropdown), what it
  is doing, where the car is (cities from Service area), preferred date/time.
  Netlify Forms (`name="booking"`, definition in `public/forms/booking.html`,
  posts there; JS shows the thank-you inline). Netlify fires
  `submission-created` → `lib/forms.mjs` → Resend: owner notification with
  Reply-To the customer, plus a customer confirmation. Recipients:
  `PRECISIONFIX_FORM_NOTIFY` env (set to hand@handprotocol.org until the
  owner's inbox is known) → `forms.booking.notify` → owner emails.
  **Form detection was OFF on the new site** (`processing_settings.ignore_html_forms`);
  turned on via API + redeployed. Payments: not built; the form is shaped so a
  deposit step (Stripe) slots in later (checklist item "Take deposits").
- **Setup tab in `/admin/`** (engine feature, `config.checklist` →
  `site/checklist.mjs`): 12 phone-first tasks with why / steps / links /
  "rather have HAND do it" / done-when; ticks are saved in the content doc
  (hidden `setup` section) with Publish. Items: theme, copy + phone check,
  photos, test booking, GitHub account, connect Claude Code, Supabase account
  (added 2026-09-15 at koH's ask, so his data can later move to a project he
  owns), Namecheap nameservers, Search Console (verification code is an editor field →
  meta tag; sitemap at `/sitemap.xml`), Google Business Profile, retire the
  old site, deposits (later). `DOMAIN` in `site/checklist.mjs` is a
  placeholder until the owner tells us the domain.
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
- **GitHub:** HandProtocol/precisionfix-site (private), **git-linked to the
  Netlify site** (installation 108354379, branch `main`, publish `public`, no
  build command): every push to `main` deploys. The link was silently broken
  from 22:55 UTC on 2026-09-15 to 03:05 UTC the next morning: the original
  `PATCH /sites/<id> { repo: {...} }` omitted the GitHub repo's numeric `id`,
  so every build after the first (three pushes, one API trigger) died in
  seconds with "Unsupported repository type." while the site kept serving
  the old deploy. Re-sending the same repo object with `id: 1372230595`
  (`gh api /repos/HandProtocol/precisionfix-site --jq .id`) fixed it: the
  next API-triggered build of `ed0bf52` went `ready`. Check
  `GET /sites/<id>/deploys` after a push rather than trusting the link.
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

- `contact.email` (shown on the page) is still empty and
  `PRECISIONFIX_FORM_NOTIFY` still = hand@handprotocol.org. The owner's address
  is known now (alexb04.uti@gmail.com) but booking notifications have not been
  switched to him; flip the env var (comma list, the HAND inbox can stay on it)
  when koH says so. Booking emails come from HAND's Resend
  sender (`EMAIL_FROM` copied from ZeroBlur); a sender on his own domain is a
  later nicety (DNS records on Netlify DNS).
- Netlify Forms free tier: 100 submissions/month, then $19/mo. Fine for a
  one-man shop; watch it if he grows.
- `submission-created.mjs` uses the classic `handler` signature on purpose
  (event-triggered functions document that form). If Netlify ever logs
  "no handler", that is the place to look.
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
> send you: that is the editor. Start with the **Setup** tab, it lists everything left in order,
> written for your phone. Try the five looks with the Theme dropdown under
> Site. Every line is yours to change, in English and Spanish. Send me your
> Namecheap domain name and your GitHub username when you have them, and the
> email you used for Supabase once that step is done.

## Next steps

1. Owner email is done (alexb04.uti@gmail.com: owner row + env). Still ask
   Alex for: the domain name (→ `DOMAIN` in `site/checklist.mjs`, DNS zone),
   his GitHub username (→ collaborator on the repo), which theme he likes,
   and the email he used for Supabase. Switch `PRECISIONFIX_FORM_NOTIFY` to
   him when koH says so.
2. Sign in at `/admin/` as hand@handprotocol.org, publish once (creates the
   content row; `source` flips to `db`), send a test booking, confirm both
   emails arrive (Resend log), tick the first checklist items.
3. Domain (Phase 5 of the skill), then Search Console with the owner.
4. Commit `clients/precisionfix/`, the migration, the template changes, and
   the skill changes when koH asks.
