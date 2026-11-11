# Publish Tracker

Tracks Play Store / App Store publication for client Flutter apps.
**Next.js 15 (App Router) + MySQL 8**, with email/password login and a companion
Chrome extension ("Play Console Publisher") that fills the store forms.

This branch (`local`) runs on a self-hosted **MySQL** database — no Supabase, no
external services. It is meant to run on your own machine for development and on
a plain VPS for production.

---

## Contents

- [Requirements](#requirements)
- [Local setup (MySQL)](#local-setup-mysql)
- [Environment variables](#environment-variables)
- [Creating the first account](#creating-the-first-account)
- [How it is built](#how-it-is-built)
- [Uploads](#uploads)
- [Store Watch (hourly cron)](#store-watch-hourly-cron)
- [Store mail (Gmail)](#store-mail-gmail)
- [Deploying to a VPS](#deploying-to-a-vps)
- [Backups](#backups)
- [Updating a running server](#updating-a-running-server)
- [Troubleshooting](#troubleshooting)

---

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20 LTS or newer | Next.js 15 needs ≥ 18.18; use 20 LTS. |
| MySQL | 8.0+ | MariaDB 10.5+ also works. |
| npm | 10+ | Ships with Node 20. |

The app stores uploaded files (keystores, logos) **on disk**, so the server
needs a writable directory that survives deploys (see [Uploads](#uploads)).

---

## Local setup (MySQL)

### 1. Install and start MySQL

macOS (Homebrew):

```bash
brew install mysql
brew services start mysql
```

Ubuntu/Debian:

```bash
sudo apt update && sudo apt install -y mysql-server
sudo systemctl enable --now mysql
```

### 2. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE publish_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 3. Import the schema

`database/schema.sql` creates every table, trigger and stored procedure.
**It drops and recreates the tables**, so it wipes any existing data.

```bash
mysql -u root -p publish_tracker < database/schema.sql
```

### 4. (Optional) Load sample data

`database/seed.sql` fills in sample clients, product lines and two demo logins
(`sabbir@example.com` / `rafi@example.com`, password `password123`). Skip this
for a clean start.

```bash
mysql -u root -p publish_tracker < database/seed.sql
```

### 5. Configure the environment

```bash
cp .env.example .env
```

Fill in `.env` (see [Environment variables](#environment-variables)). At minimum
set `DATABASE_URL` and `AUTH_SECRET`.

### 6. Install dependencies and run

```bash
npm install
npm run dev
```

Open http://localhost:3000. If you loaded the seed, sign in with
`sabbir@example.com` / `password123`. If not, [create the first account](#creating-the-first-account).

> **Database GUI (optional):** any MySQL client works (TablePlus, DBeaver,
> phpMyAdmin). On macOS, phpMyAdmin via Laravel Herd at `http://phpmyadmin.test`
> is a quick option.

---

## Environment variables

Copy `.env.example` to `.env` and fill these in. The app reads `.env` at startup.

| Variable | Required | Example | What it is |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | `mysql://root:secret@localhost:3306/publish_tracker` | MySQL connection string. |
| `AUTH_SECRET` | yes | *(32+ random bytes)* | Signs the login session cookie. Generate with `openssl rand -base64 32`. Changing it signs everyone out. |
| `UPLOAD_DIR` | no (default `./uploads`) | `/var/lib/publish-tracker/uploads` | Where keystores and logos are stored. Use an absolute path in production. |
| `STORE_WATCH_KEY` | for Store Watch | *(random string)* | Shared secret the hourly cron sends in the `x-store-watch-key` header. |
| `APP_URL` | recommended | `https://tracker.example.com` | Public URL, used to build links (e.g. the client intake form). |

Before `DATABASE_URL` and `AUTH_SECRET` are set, every page redirects to `/setup`
with instructions — that is expected on a fresh checkout.

---

## Creating the first account

There is **no public sign-up**. Create the first account directly in the
database; after that, add teammates from **Settings → Team** in the app.

Inserting a `users` row automatically creates its team member (via a trigger),
so you only insert one row. Passwords are stored as bcrypt hashes.

With the project's dependencies installed, run this once (it reads
`DATABASE_URL` from `.env`):

```bash
node -e '
const fs = require("fs");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { randomUUID } = require("crypto");
const uri = fs.readFileSync(".env","utf8").match(/^DATABASE_URL="?([^"\n]+)/m)[1];
const [email, password, name] = ["admin@example.com", "change-this-password", "Admin"];
(async () => {
  const c = await mysql.createConnection({ uri });
  await c.query("INSERT INTO users (id, email, password_hash, name) VALUES (?,?,?,?)",
    [randomUUID(), email.toLowerCase(), bcrypt.hashSync(password, 10), name]);
  await c.end();
  console.log("Created", email);
})();
'
```

Change `email`, `password` and `name` first. Then sign in and manage the rest of
the team from **Settings → Team**.

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
- **Database access:** `mysql2/promise` pool in `src/lib/db.ts`. Schema, triggers
  and procedures live in `database/schema.sql`.
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

Files live on disk under `UPLOAD_DIR` (default `./uploads`):

```
uploads/
  jks/      keystore files — private, downloaded only by signed-in team members
  logos/    product-line logos — public, served at /uploads/logos/...
```

This folder is **not** in git and is **not** recreated by a deploy. In
production, point `UPLOAD_DIR` at a stable path outside the app directory (e.g.
`/var/lib/publish-tracker/uploads`) so updates never touch it, and
[back it up](#backups).

---

## Store Watch (hourly cron)

Store Watch checks each running app's public store page and flags when it has
gone live. It runs as an HTTP endpoint protected by `STORE_WATCH_KEY`:

```bash
curl -X POST -H "x-store-watch-key: $STORE_WATCH_KEY" https://tracker.example.com/api/store-watch
```

Run it hourly from the server's crontab (`crontab -e`):

```cron
0 * * * * curl -s -X POST -H "x-store-watch-key: YOUR_KEY" https://tracker.example.com/api/store-watch > /dev/null
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

### Database

On an existing server apply `database/migrations/2026-11-08-store-mails.sql`
(adds `mail_tickets`, `mail_ticket_events`, `store_mails` and `mail_syncs`).

---

## Deploying to a VPS

A plain Ubuntu 22.04/24.04 VPS, with Node + MySQL running directly on the box and
Nginx in front for TLS. (If your VPS has a panel like CloudPanel/Plesk, you can
use its MySQL, Node app and reverse-proxy features instead of the manual steps —
the env vars and build/start commands are the same.)

### 1. Install Node 20 and MySQL

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs mysql-server git
sudo systemctl enable --now mysql
sudo mysql_secure_installation      # set a root password
```

### 2. Create the database and a dedicated user

```sql
sudo mysql
CREATE DATABASE publish_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tracker'@'localhost' IDENTIFIED BY 'a-strong-password';
GRANT ALL PRIVILEGES ON publish_tracker.* TO 'tracker'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3. Get the code and import the schema

```bash
sudo mkdir -p /var/www && cd /var/www
sudo git clone -b local <YOUR_REPO_URL> publish-tracker
cd publish-tracker
mysql -u tracker -p publish_tracker < database/schema.sql
```

### 4. Configure, build

```bash
cp .env.example .env
nano .env     # fill in the values below
```

```ini
DATABASE_URL="mysql://tracker:a-strong-password@localhost:3306/publish_tracker"
AUTH_SECRET="<output of: openssl rand -base64 32>"
UPLOAD_DIR="/var/lib/publish-tracker/uploads"
STORE_WATCH_KEY="<output of: openssl rand -base64 24>"
APP_URL="https://tracker.example.com"
```

```bash
sudo mkdir -p /var/lib/publish-tracker/uploads
sudo chown -R "$USER" /var/lib/publish-tracker/uploads

npm ci
npm run build
```

Then [create the first account](#creating-the-first-account).

### 5. Run it as a service

Keep the app running with systemd:

```bash
sudo tee /etc/systemd/system/publish-tracker.service >/dev/null <<'UNIT'
[Unit]
Description=Publish Tracker
After=network.target mysql.service

[Service]
WorkingDirectory=/var/www/publish-tracker
ExecStart=/usr/bin/npm run start
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=/var/www/publish-tracker/.env
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
UNIT

sudo chown -R www-data:www-data /var/www/publish-tracker
sudo chown -R www-data:www-data /var/lib/publish-tracker/uploads
sudo systemctl daemon-reload
sudo systemctl enable --now publish-tracker
sudo systemctl status publish-tracker
```

The app now listens on `127.0.0.1:3000`. (pm2 works too, if you prefer:
`pm2 start npm --name publish-tracker -- run start`.)

### 6. Nginx reverse proxy + TLS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/publish-tracker >/dev/null <<'NGINX'
server {
    server_name tracker.example.com;

    client_max_body_size 10M;   # keystore / logo uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/publish-tracker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tracker.example.com
```

### 7. Schedule Store Watch

Add the hourly cron from [Store Watch](#store-watch-hourly-cron) to the server's
crontab.

Done — the app is live at `https://tracker.example.com`.

---

## Backups

Two things hold state: the MySQL database and the uploads directory.

```bash
# Database
mysqldump -u tracker -p publish_tracker > backup-$(date +%F).sql

# Uploads
tar czf uploads-$(date +%F).tar.gz -C /var/lib/publish-tracker uploads
```

A nightly cron that dumps both and copies them off the box is strongly
recommended. Restore with `mysql ... < backup.sql` and by unpacking the tarball.

---

## Updating a running server

```bash
cd /var/www/publish-tracker
sudo -u www-data git pull
sudo -u www-data npm ci
sudo -u www-data npm run build
sudo systemctl restart publish-tracker
```

If a release changes the database, apply the SQL change before restarting.
`database/schema.sql` **drops tables** — never re-run it on a live database; make
the specific `ALTER`/`CREATE` change by hand (or from a migration file) instead.

---

## Troubleshooting

- **Every page redirects to `/setup`** — `DATABASE_URL` or `AUTH_SECRET` is
  missing from `.env`. Fill them in and restart.
- **"Could not load data"** — MySQL isn't reachable, or `database/schema.sql`
  hasn't been imported into the database in `DATABASE_URL`.
- **Signed out unexpectedly** — `AUTH_SECRET` changed, or the matching `users`
  row was deleted (a deleted account is signed out everywhere).
- **Logos/keystores vanish after a deploy** — `UPLOAD_DIR` points inside the app
  directory and got replaced. Move it to a stable path like
  `/var/lib/publish-tracker/uploads`.
- **Do not run `next build` while `next dev` is running** — they share `.next`.
  Typecheck with `npx tsc --noEmit` instead.
