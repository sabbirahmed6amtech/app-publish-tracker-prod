# Publish Tracker

Tracks Play Store / App Store publication for client Flutter apps.
**Next.js 15 (App Router) + Supabase (Postgres + Storage)**, deployed on
**Vercel**, with email/password login and a companion Chrome extension
("Play Console Publisher") that fills the store forms.

---

## Contents

- [Requirements](#requirements)
- [Supabase setup](#supabase-setup)
- [Deploying to Vercel](#deploying-to-vercel)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Creating the first account](#creating-the-first-account)
- [How it is built](#how-it-is-built)
- [Uploads](#uploads)
- [Store Watch (daily cron)](#store-watch-daily-cron)
- [Store mail (Gmail)](#store-mail-gmail)
- [Database changes](#database-changes)
- [Troubleshooting](#troubleshooting)

---

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20 LTS or newer | Next.js 15 needs ≥ 18.18. |
| Supabase CLI | 2.x | `brew install supabase/tap/supabase` — for migrations. |
| A Supabase project | | Postgres 15+ (new projects are 17). |
| A Vercel project | | Hobby or Pro (see the cron note under Store Watch). |

---

## Supabase setup

### 1. Apply the schema

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

`supabase/migrations/` creates every table, enum, trigger and function, turns on
RLS for every table, and creates the `jks` and `logos` storage buckets.

### 2. (Optional) Load sample data

`supabase/seed.sql` fills in sample clients, product lines and two demo logins
(`sabbir@example.com` / `rafi@example.com`, password `password123`). It empties
the tables first. Paste it into **SQL Editor** in the dashboard, or:

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

### 3. Collect the connection values

- **`DATABASE_URL`** — dashboard → **Connect** → **Transaction pooler** (port
  `6543`). Replace `[YOUR-PASSWORD]` with the database password. This is the one
  to use on Vercel: serverless functions open many short connections.
- **`SUPABASE_URL`** and **`SUPABASE_SECRET_KEY`** — dashboard → **Project
  Settings → API Keys** (the secret / `service_role` key). Server-side only; never
  put it in a `NEXT_PUBLIC_` variable.

---

## Deploying to Vercel

1. Import the repo in Vercel (framework preset **Next.js**; no build settings to
   change).
2. Add the [environment variables](#environment-variables) for Production (and
   Preview if you use it). At minimum: `DATABASE_URL`, `AUTH_SECRET`,
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `APP_URL`.
3. Deploy. `vercel.json` registers the Store Watch cron.
4. In Google Cloud, add the Vercel domain to the OAuth client's **Authorized
   JavaScript origins** (Drive export and Gmail sync sign in from the browser).
5. [Create the first account](#creating-the-first-account) (or load the seed).

Long routes (`/api/store-watch`, `/api/github/zip`) ask for `maxDuration = 300`,
which needs Fluid compute (the default for new projects).

---

## Local development

```bash
cp .env.example .env     # fill in DATABASE_URL and AUTH_SECRET at least
npm install
npm run dev
```

Point `DATABASE_URL` at your Supabase project, or run a local stack with
`supabase start` (needs Docker) and use
`postgresql://postgres:postgres@127.0.0.1:54322/postgres` — `supabase db reset`
applies the migrations and the seed.

Open http://localhost:3000. With the seed loaded, sign in with
`sabbir@example.com` / `password123`.

---

## Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Supabase Postgres connection string (transaction pooler on Vercel). |
| `AUTH_SECRET` | yes | Signs the login session cookie. `openssl rand -base64 32`. Changing it signs everyone out. |
| `SUPABASE_URL` | on Vercel | Project URL, for Storage. |
| `SUPABASE_SECRET_KEY` | on Vercel | Secret (service role) key, for Storage. Server-side only. |
| `CRON_SECRET` | for Store Watch | Vercel Cron sends it as a Bearer token. |
| `STORE_WATCH_KEY` | no | Lets an external scheduler call Store Watch via `x-store-watch-key`. |
| `APP_URL` | recommended | Public URL, used to build links (e.g. the client intake form). |
| `UPLOAD_DIR` | no | Disk folder for files when Supabase Storage isn't set (local only). |
| `DATABASE_POOL_SIZE` | no (default 5) | Connections per server instance. |
| `GITHUB_TOKEN`, `GITHUB_ORG` | for source export | See `.env.example`. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_DRIVE_FOLDER_ID` | for Drive export / Gmail sync | See `.env.example`. |

Before `DATABASE_URL` and `AUTH_SECRET` are set, every page redirects to `/setup`
with instructions — that is expected on a fresh checkout.

---

## Creating the first account

There is **no public sign-up**. Create the first account directly in the
database; after that, add teammates from **Settings → Team** in the app.
Inserting a `users` row automatically creates its team member (via a trigger).

Make a bcrypt hash locally:

```bash
node -e 'console.log(require("bcryptjs").hashSync(process.argv[1], 10))' 'change-this-password'
```

Then in the Supabase **SQL Editor**:

```sql
insert into users (email, password_hash, name)
values ('admin@example.com', '<the hash>', 'Admin');
```

---

## How it is built

Clients are published in rounds. Each round is a **release** with its own
version, dates and owner:

```
client                       one support ticket
  ├── publisher_account      the store accounts they own — stable across rounds
  ├── product                a permanent app, set up once, submitted each round
  └── release                one publication round: version, assigned_to, dates
        └── app              what was submitted in that round, to which account

team_member                  who work is assigned to (optionally a login account)
product_line                 a 6amTech product (6amMart, StackFood …); groups
                             projects and carries logos + generic store copy
```

- **Stack:** Next.js 15 App Router (server components, server actions, route
  handlers, middleware), React 19, Tailwind v4, shadcn/ui, sonner.
- **Database access:** a `pg` pool in `src/lib/db.ts`, straight to Supabase
  Postgres from the server (no Data API, no supabase-js for data). Schema,
  triggers and functions live in `supabase/migrations/`. Every table has RLS on
  with no policies, so the public `anon`/`authenticated` keys can read nothing.
- **Auth:** bcrypt password hashes + a signed JWT (`jose`, HS256) in an httpOnly
  `pt_session` cookie. `src/middleware.ts` guards pages; public paths are
  `/login`, `/track`, `/intake`, `/uploads/logos/`, `/api/store-watch`,
  `/api/auth/signout`.
- Every status change is written to `app_events`, which powers the activity feed
  and the "sitting in review for N days" flags. A release's state (Needs
  attention / Complete) is derived, never stored.

### Key pages

| Route | What it does |
| --- | --- |
| `/` | Open releases, pipeline breakdown, what needs attention, activity |
| `/releases/[id]` | The main view: one release, apps grouped by store account |
| `/clients`, `/clients/[id]` | Clients, store accounts, release history |
| `/reports` | Everything across every client, filterable, CSV export |
| `/settings` | Team, product lines (+ their store descriptions), import/export |
| `/track`, `/track/[ticket]` | Public, read-only status tracker |
| `/intake/[token]` | The private client intake form |

---

## Uploads

With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` set, files go to Supabase Storage
(buckets created by the first migration):

```
jks      keystore files — downloaded only by signed-in team members
logos    product-line logos — public, served by the app at /uploads/logos/...
```

Without them, files are kept on disk under `UPLOAD_DIR` (default `./uploads`) —
fine locally, but **not on Vercel**, whose disk is thrown away.

---

## Store Watch (daily cron)

Store Watch checks each running app's public store page and flags when it has
gone live. On Vercel, `vercel.json` schedules it once a day at 06:00 UTC (the
Hobby plan allows only daily cron jobs); Vercel sends
`Authorization: Bearer $CRON_SECRET`, so set `CRON_SECRET` in the project.

> On the Pro plan, set the schedule in `vercel.json` to `0 * * * *` to run it
> hourly, or call the endpoint more often from any external scheduler.

Any other scheduler can still call it with `STORE_WATCH_KEY`:

```bash
curl -X POST -H "x-store-watch-key: $STORE_WATCH_KEY" https://tracker.example.com/api/store-watch
```

It only checks apps that are running (not yet in production), one at a time.

---

## Store mail (Gmail)

**Store mail** in the sidebar turns the emails that App Store Connect, Google
Play, Firebase and Google Cloud send to the shared mailbox into **tickets**:

- Each rejection, build issue, policy notice, crash alert or account warning
  opens a ticket (`SM-12`). Repeat emails about the same thing join it.
- A ticket is **Open → In progress → Resolved**, has an **assignee** (by default
  whoever owns the client's latest release) and an activity log with notes.
- A new email on a resolved ticket **reopens** it. A later App Store approval
  **resolves** an open rejection or build-issue ticket for the same app.
- Every open tracker tab checks every 45 seconds and shows a **popup** for new
  or reopened tickets, plus a **desktop notification** once someone clicks
  *Turn on desktop alerts* on the Store mail page.
- Each client's **Store mail** tab lists every email per app, with its ticket.

Each email is matched to an app with no per-client setup:

1. the app's **package name / bundle ID** appears in the subject or body, else
2. the **app name** in the subject equals the app's store listing name or
   project name, else
3. the ticket shows as **not matched to an app**. **Link to app** fixes it, and
   later emails with the same name follow automatically.

Unmatched emails that need no action are skipped.

### Sync inbox

**Sync inbox** reads the mailbox from the browser, like the Drive export:
whoever clicks it signs in with the mailbox account (read-only). It reads the
last 48 hours at most. It needs, in the Google Cloud project that owns
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`: the **Gmail API** enabled, the
`https://www.googleapis.com/auth/gmail.readonly` scope on the consent screen,
and (while in Testing) the mailbox added as a **test user**.

---

## Database changes

Schema changes are migrations in `supabase/migrations/`:

```bash
supabase migration new <what-changed>   # write the SQL in the new file
supabase db push                        # apply to the linked project
```

Supabase keeps daily backups of the database (Point-in-Time Recovery on paid
plans). Storage files live in the `jks` and `logos` buckets.

---

## Troubleshooting

- **Every page redirects to `/setup`** — `DATABASE_URL` or `AUTH_SECRET` is
  missing. Set them (in Vercel: Settings → Environment Variables) and redeploy.
- **"Could not load data"** — the database isn't reachable, or the migrations
  haven't been applied (`supabase db push`).
- **`prepared statement … already exists` / too many connections** — use the
  transaction pooler URL (port `6543`) on Vercel, not the direct connection.
- **Uploads fail on Vercel** — `SUPABASE_URL` / `SUPABASE_SECRET_KEY` are missing,
  so the app fell back to disk.
- **Store Watch never runs** — `CRON_SECRET` isn't set (see
  [Store Watch](#store-watch-daily-cron)).
- **Do not run `next build` while `next dev` is running** — they share `.next`.
  Typecheck with `npx tsc --noEmit` instead.
