// Prints the Supabase migration for this site from site.config.mjs: five
// <prefix>_* tables in the `command` schema (six with a booking calendar),
// RLS on with no policies (service role only), the public Storage bucket,
// the seed media rows, and the first owner (the HAND operator inbox).
//
//   node scripts/gen-migration.mjs                 → stdout
//   node scripts/gen-migration.mjs --out=<file>    → write file
//   node scripts/gen-migration.mjs --deposit       → only the deposit columns, for a site live before it took deposits
//   node scripts/gen-migration.mjs --car           → only the car / self-report columns, for a site live before the funnel
//   node scripts/gen-migration.mjs --secrets       → only the secrets table (config.payments), for a site live before Payments
//   node scripts/gen-migration.mjs --passwords     → only the password columns on editors, for a site live before passwords
//   node scripts/gen-migration.mjs --questions     → only the customer + conversation tables (config.questions)
//   node scripts/gen-migration.mjs --bookings      → only the bookings table, for a
//                                                    site that was live before it had a calendar
//                                                    (new numbered migration; never edit an applied one)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BOOKING, config, seedMedia } from '../netlify/functions/lib/config.mjs';

const FIRST_OWNER = 'hand@handprotocol.org';

function q(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

// The bookings table (config.booking in request mode). Requests are never
// exclusive, so there is no uniqueness on (starts_at); the owner resolves
// overlaps in the Bookings tab. Tokens are sha256 hashes like login tokens.
export function bookingsTableSql() {
  const T = config.tables;
  const S = config.supabase.schema;
  return `-- ${T.bookings}: booking requests and confirmed jobs (lib/booking.mjs).
--   status      requested | confirmed | declined | cancelled | completed | no_show
--   starts_at/ends_at    the time on the books (owner may move it); requested_* keep the original ask
--   window      the window label when the customer picked a window instead of an exact time
--   intake      the pack's extra fields (car, VIN …) as jsonb
--   manage_token_hash    customer link (cancel / ask for another time), never expires
--   act_token_hash       owner one-tap link in the notification email (single use, 7 days)
create table if not exists ${S}.${T.bookings} (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')),
  service_key text not null default '',
  service_label text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  tz text not null,
  "window" text not null default '',
  requested_starts_at timestamptz not null,
  requested_ends_at timestamptz not null,
  name text not null,
  phone text not null default '',
  email text not null default '',
  lang text not null default 'en',
  contact_pref text not null default 'text',
  location_kind text not null default 'at_customer',
  address text not null default '',
  city text not null default '',
  intake jsonb not null default '{}'::jsonb,
  notes text not null default '',
  owner_note text not null default '',
  decline_reason text not null default '',
  manage_token_hash text unique,
  act_token_hash text unique,
  act_expires_at timestamptz,
  source text not null default 'site' check (source in ('site', 'owner')),
  request_ip text,
  reminder_sent_at timestamptz,
  reminder_soon_sent_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references ${S}.${T.editors}(id) on delete set null
);

-- Columns added after the first release. A no-op on a fresh table; on a table
-- that predates them (create table above skipped), this is what adds them.
-- Apply BEFORE deploying code that selects the column: PostgREST rejects an
-- unknown column, which would fail every bookings query.
alter table ${S}.${T.bookings}
  add column if not exists reminder_soon_sent_at timestamptz;

${depositColumnsSql()}
${carColumnsSql()}
create index if not exists ${T.bookings}_status_starts_idx
  on ${S}.${T.bookings} (status, starts_at);

create index if not exists ${T.bookings}_created_idx
  on ${S}.${T.bookings} (created_at desc);

alter table ${S}.${T.bookings} enable row level security;
revoke all on ${S}.${T.bookings} from anon, authenticated;
`;
}

// The deposit (config.booking.deposit, lib/booking-deposit.mjs). Idempotent,
// so it sits inside bookingsTableSql() for new sites and is the whole of
// depositMigrationSql() for a site that was live before it had a deposit.
//   deposit_status  none | due | paid | refunded | kept
//   deposit_due_by  end of the hold the owner is nudged after (booking-reminders.mjs)
export function depositColumnsSql() {
  const T = config.tables;
  const S = config.supabase.schema;
  return `alter table ${S}.${T.bookings}
  add column if not exists deposit_status text not null default 'none'
    check (deposit_status in ('none', 'due', 'paid', 'refunded', 'kept')),
  add column if not exists deposit_amount integer,
  add column if not exists deposit_currency text,
  add column if not exists deposit_due_by timestamptz,
  add column if not exists deposit_session_id text,
  add column if not exists deposit_payment_intent text,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists deposit_refund_id text,
  add column if not exists deposit_refunded_at timestamptz,
  add column if not exists deposit_nudge_sent_at timestamptz;

create index if not exists ${T.bookings}_deposit_session_idx
  on ${S}.${T.bookings} (deposit_session_id);
`;
}

// The car and the self-report shared after the request (lib/booking-car.mjs):
//   vin / car_model          which car (one or the other, both optional)
//   issues                   what the customer noticed, sent only with the agreement
//   self_report_ack/notice   the agreement and the version of the notice shown
export function carColumnsSql() {
  const T = config.tables;
  const S = config.supabase.schema;
  return `alter table ${S}.${T.bookings}
  add column if not exists vin text not null default '',
  add column if not exists car_model text not null default '',
  add column if not exists issues text not null default '',
  add column if not exists self_report_ack boolean not null default false,
  add column if not exists self_report_notice text not null default '';
`;
}

export function carMigrationSql() {
  return `-- ${config.name}: booking car + self-report columns (clients/${config.slug}/), added with the booking funnel.
-- Generated by scripts/gen-migration.mjs --car from site.config.mjs.
-- Apply BEFORE deploying the code that selects these columns.

${carColumnsSql()}`;
}

export function depositMigrationSql() {
  return `-- ${config.name}: booking deposit columns (clients/${config.slug}/), added after the calendar went live.
-- Generated by scripts/gen-migration.mjs --deposit from site.config.mjs.
-- Apply BEFORE deploying the code that selects these columns.

${depositColumnsSql()}`;
}

export function bookingsMigrationSql() {
  return `-- ${config.name}: booking calendar (clients/${config.slug}/), added after the site went live.
-- Generated by scripts/gen-migration.mjs --bookings from site.config.mjs.
-- Written exclusively through the site's Netlify functions using the service role.

${bookingsTableSql()}`;
}

// Owner-supplied secrets (config.payments: the Stripe key pasted in /admin/ →
// Payments), sealed with AES-256-GCM by lib/secrets.mjs before they are
// written. Service role only, like every other table here.
export function secretsTableSql() {
  const T = config.tables;
  const S = config.supabase.schema;
  return `-- ${T.secrets}: keys the owner connects in /admin/ (lib/secrets.mjs). value is sealed
-- (AES-256-GCM, key derived from the site's session secret); meta is plain and
-- holds only what the admin shows (account name, live/test, last 4).
create table if not exists ${S}.${T.secrets} (
  name text primary key check (name ~ '^[a-z][a-z0-9_]{0,39}$'),
  value text not null,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references ${S}.${T.editors}(id) on delete set null
);

alter table ${S}.${T.secrets} enable row level security;
revoke all on ${S}.${T.secrets} from anon, authenticated;
`;
}

// Optional editor passwords (netlify/functions/lib/password.mjs). Every
// statement is idempotent, so the full migration can carry it too.
export function passwordColumnsSql() {
  const T = config.tables;
  const S = config.supabase.schema;
  return `alter table ${S}.${T.editors}
  add column if not exists password_hash text,
  add column if not exists password_set_at timestamptz,
  add column if not exists sessions_after timestamptz,
  add column if not exists failed_logins integer not null default 0,
  add column if not exists locked_until timestamptz;
`;
}

export function passwordsMigrationSql() {
  return `-- ${config.name}: optional editor passwords next to the magic link (clients/${config.slug}/).
-- Generated by scripts/gen-migration.mjs --passwords from site.config.mjs.
-- Apply BEFORE deploying the code that reads it (every signed-in request
-- selects password_set_at and sessions_after).

${passwordColumnsSql()}`;
}

// Customers asking before they book (config.questions): an account per
// email (link or password, like editors), a thread per question, its
// messages. Emails are stored lowercase, so eq. lookups are exact.
export function questionsTablesSql() {
  const T = config.tables;
  const S = config.supabase.schema;
  return `-- ${T.customers}: customer accounts (lib/customers.mjs). email_verified_at is set the
-- first time they open an emailed link; until then no password can be set.
create table if not exists ${S}.${T.customers} (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text not null default '',
  phone text not null default '',
  lang text not null default 'en',
  email_verified_at timestamptz,
  password_hash text,
  password_set_at timestamptz,
  sessions_after timestamptz,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- ${T.customer_tokens}: single-use sign-in links for customers (sha256 hashes).
create table if not exists ${S}.${T.customer_tokens} (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references ${S}.${T.customers} (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  request_ip text,
  created_at timestamptz not null default now()
);
create index if not exists ${T.customer_tokens}_customer_idx on ${S}.${T.customer_tokens} (customer_id, created_at desc);

-- ${T.threads}: one conversation per question. owner_unread / customer_unread
-- drive the badges; request_ip only rate-limits new questions.
create table if not exists ${S}.${T.threads} (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references ${S}.${T.customers} (id) on delete cascade,
  subject text not null default '',
  car text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  owner_unread boolean not null default true,
  customer_unread boolean not null default false,
  last_author text not null default 'customer' check (last_author in ('customer', 'owner')),
  last_message_at timestamptz not null default now(),
  request_ip text,
  created_at timestamptz not null default now()
);
create index if not exists ${T.threads}_customer_idx on ${S}.${T.threads} (customer_id, last_message_at desc);
create index if not exists ${T.threads}_recent_idx on ${S}.${T.threads} (last_message_at desc);

-- ${T.messages}: the conversation. via = web | email; inbound_id is the
-- provider's id for a reply that came in by email (never stored twice).
create table if not exists ${S}.${T.messages} (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references ${S}.${T.threads} (id) on delete cascade,
  author text not null check (author in ('customer', 'owner')),
  editor_id uuid,
  body text not null check (char_length(body) between 1 and 5000),
  via text not null default 'web' check (via in ('web', 'email')),
  inbound_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists ${T.messages}_thread_idx on ${S}.${T.messages} (thread_id, created_at);

alter table ${S}.${T.customers} enable row level security;
alter table ${S}.${T.customer_tokens} enable row level security;
alter table ${S}.${T.threads} enable row level security;
alter table ${S}.${T.messages} enable row level security;
revoke all on ${S}.${T.customers} from anon, authenticated;
revoke all on ${S}.${T.customer_tokens} from anon, authenticated;
revoke all on ${S}.${T.threads} from anon, authenticated;
revoke all on ${S}.${T.messages} from anon, authenticated;
`;
}

export function questionsMigrationSql() {
  return `-- ${config.name}: customer accounts and questions before booking (clients/${config.slug}/).
-- Generated by scripts/gen-migration.mjs --questions from site.config.mjs.
-- Apply BEFORE deploying the code that reads it.

${questionsTablesSql()}`;
}

export function secretsMigrationSql() {
  return `-- ${config.name}: owner-connected Stripe (clients/${config.slug}/), the secrets table for /admin/ → Payments.
-- Generated by scripts/gen-migration.mjs --secrets from site.config.mjs.
-- Apply BEFORE deploying the code that reads it (the Payments screen and the
-- key loader query it on every admin, booking and page request).

${secretsTableSql()}`;
}

export function migrationSql() {
  const T = config.tables;
  const S = config.supabase.schema;
  const seeds = seedMedia();
  const seedRows = seeds
    .map(
      (m) =>
        `  (${q(m.id)}, ${m.sort}, ${q(m.path)}, ${m.is_placeholder}, ${q(m.alt)}, ${q(m.caption)}, ${q(m.category)}, ${m.featured}, ${m.width || 'null'}, ${m.height || 'null'}, ${q(m.mime)})`
    )
    .join(',\n');
  return `-- ${config.name} — owner-editable site (clients/${config.slug}/).
-- Generated by scripts/gen-migration.mjs from site.config.mjs. Re-run the
-- generator instead of editing by hand; if the site is already live, write a
-- NEW numbered migration for changes.
--
-- Written exclusively through the site's Netlify functions using the service
-- role. RLS is enabled with no policies so anon/authenticated roles cannot
-- touch these rows; the service role bypasses RLS.
--
-- Tables (schema \`${S}\`, prefix ${config.dbPrefix}_):
--   ${T.editors}       who may log in to /admin/ (owner | editor)
--   ${T.login_tokens}  single-use magic-link tokens (sha256 hashes)
--   ${T.content}       one jsonb document per key ('site')
--   ${T.media}         gallery images, ordered; seed rows below
--   ${T.revisions}     snapshot on every publish (owner-side undo/history)${config.payments ? `
--   ${T.secrets}       sealed keys the owner connects (Stripe)` : ''}${BOOKING ? `
--   ${T.bookings}      booking requests and confirmed jobs (booking calendar)` : ''}
-- Storage: public bucket \`${config.bucket}\` for owner uploads.

create table if not exists ${S}.${T.editors} (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  invited_by uuid references ${S}.${T.editors}(id) on delete set null
);

create unique index if not exists ${T.editors}_email_key
  on ${S}.${T.editors} (lower(email));

${passwordColumnsSql()}
create table if not exists ${S}.${T.login_tokens} (
  id uuid primary key default gen_random_uuid(),
  editor_id uuid not null references ${S}.${T.editors}(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  request_ip text
);

create index if not exists ${T.login_tokens}_editor_idx
  on ${S}.${T.login_tokens} (editor_id, created_at desc);

create table if not exists ${S}.${T.content} (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references ${S}.${T.editors}(id) on delete set null
);

create table if not exists ${S}.${T.media} (
  id uuid primary key default gen_random_uuid(),
  sort integer not null default 0,
  -- storage object path inside the bucket, or a site-relative path
  -- (/img/placeholder/ph-01.svg) for seeded files shipped with the site
  path text not null,
  is_placeholder boolean not null default false,
  alt text not null default '',
  caption text not null default '',
  category text not null default '',
  featured boolean not null default false,
  width integer,
  height integer,
  bytes integer,
  mime text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ${T.media}_sort_idx
  on ${S}.${T.media} (sort, created_at);

create table if not exists ${S}.${T.revisions} (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  editor_id uuid references ${S}.${T.editors}(id) on delete set null,
  kind text not null check (kind in ('content', 'media')),
  snapshot jsonb not null
);

create index if not exists ${T.revisions}_created_idx
  on ${S}.${T.revisions} (created_at desc);

${BOOKING ? bookingsTableSql() : ''}
${config.payments ? secretsTableSql() : ''}
${config.questions ? questionsTablesSql() : ''}
alter table ${S}.${T.editors} enable row level security;
alter table ${S}.${T.login_tokens} enable row level security;
alter table ${S}.${T.content} enable row level security;
alter table ${S}.${T.media} enable row level security;
alter table ${S}.${T.revisions} enable row level security;

-- Belt and braces: even if a client-side key reaches the API, anon and
-- authenticated get nothing. The service role bypasses RLS.
revoke all on ${S}.${T.editors} from anon, authenticated;
revoke all on ${S}.${T.login_tokens} from anon, authenticated;
revoke all on ${S}.${T.content} from anon, authenticated;
revoke all on ${S}.${T.media} from anon, authenticated;
revoke all on ${S}.${T.revisions} from anon, authenticated;

-- Public bucket for owner uploads. Objects are read at
-- /storage/v1/object/public/${config.bucket}/<path>; uploads go through signed
-- upload URLs minted by the service role, so no storage policies are needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  ${q(config.bucket)}, ${q(config.bucket)}, true, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do nothing;

${
  seeds.length
    ? `-- Seed: ${seeds.length} media rows so the admin grid mirrors the live gallery
-- from day one. Placeholders are removed by the owner as real photos arrive.
insert into ${S}.${T.media} (id, sort, path, is_placeholder, alt, caption, category, featured, width, height, mime)
values
${seedRows}
on conflict (id) do nothing;`
    : '-- No seed media.'
}

-- First editor: the HAND operator inbox, so the site can be tested before the
-- client's own email is added (admin Editors tab or ${config.envPrefix}_OWNER_EMAILS).
insert into ${S}.${T.editors} (email, role)
values (${q(FIRST_OWNER)}, 'owner')
on conflict do nothing;
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6);
  const onlyBookings = process.argv.includes('--bookings');
  const onlySecrets = process.argv.includes('--secrets');
  const onlyPasswords = process.argv.includes('--passwords');
  const onlyQuestions = process.argv.includes('--questions');
  if (onlyQuestions && !config.questions) {
    console.error('site.config.mjs has no questions; nothing to generate');
    process.exit(1);
  }
  if (onlySecrets && !config.payments) {
    console.error('site.config.mjs has no payments; nothing to generate');
    process.exit(1);
  }
  const onlyDeposit = process.argv.includes('--deposit');
  const onlyCar = process.argv.includes('--car');
  if ((onlyBookings || onlyDeposit || onlyCar) && !BOOKING) {
    console.error('site.config.mjs has no booking calendar in request mode; nothing to generate');
    process.exit(1);
  }
  const sql = onlyQuestions ? questionsMigrationSql() : onlyPasswords ? passwordsMigrationSql() : onlySecrets ? secretsMigrationSql() : onlyCar ? carMigrationSql() : onlyDeposit ? depositMigrationSql() : onlyBookings ? bookingsMigrationSql() : migrationSql();
  if (out) {
    writeFileSync(out, sql);
    console.log(`wrote ${out}`);
  } else {
    process.stdout.write(sql);
  }
}
