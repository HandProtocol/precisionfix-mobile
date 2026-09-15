# Handoff — PrecisionFix · 2026-09-15

Client site for PrecisionFix (owner: TBD). Server-rendered single page
with an owner CMS at `/admin/` (passwordless email link) for all copy and
photos. Built from `clients/_template` with the `hand-client-site` skill on
2026-09-15.

**Status:** LIVE at https://precisionfix-austin.netlify.app since 2026-09-15 (provisioned by provision.mjs). Fill in as it progresses.

## Start here (cold session)

1. Read this file, then `README.md` (architecture, deploy, env vars).
2. Site pack = `site.config.mjs`, `site/schema.mjs`, `site/page.mjs`,
   `public/assets/site.css|site.js`. Everything else is engine — do not edit
   it here; fix in `clients/_template` and run `sync-engine.mjs precisionfix`.
3. `npm test` runs with no DB. `npm run preview` renders `dist-preview/`.

## Who can sign in (all `owner` role)

| Email | Who |
|---|---|
| hand@handprotocol.org | HAND operator inbox, seeded by migration |

## Where things are

- **Code:** `clients/precisionfix/`
- **Database:** HAND's shared Supabase project `vconmgerblqbworcqkvr`, tables
  `command.precisionfix_editors / login_tokens / content / media / revisions`;
  migration `command/supabase/migrations/046_precisionfix.sql` — applied: **yes** (2026-09-15).
- **Storage:** public bucket `precisionfix`.
- **Netlify:** project `precisionfix`, site id `9f248232-981f-4a15-a891-a62f949f92fa`, account **cryptokoh**.
  Env vars per README.
- **Custom domain:** none yet.

## Next steps

1. Design pass on the site pack (theme, copy, layout) → `npm test` + preview.
2. `node .claude/skills/hand-client-site/scripts/provision.mjs precisionfix` (creates
   the Netlify site, sets env, applies the migration, deploys, verifies).
3. Owner signs in at `/admin/`, replaces placeholders, publishes.
