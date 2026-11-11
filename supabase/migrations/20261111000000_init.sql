-- ============================================================================
-- Publish Tracker — Postgres schema (Supabase)
--
-- Tables, links and the triggers that keep them consistent. Ids are UUID text.
-- Times are stored as timestamptz (UTC).
--
-- ============================================================================

create type platform as enum ('play_store', 'app_store');
create type account_type as enum ('organization', 'personal');
create type access_method as enum ('invite', 'login');
create type app_status as enum ('ongoing', 'in_review', 'closed_testing', 'rejected', 'production', 'on_hold');
create type mail_source as enum ('app_store', 'play_store', 'firebase', 'google_cloud', 'other');
create type ticket_status as enum ('open', 'in_progress', 'resolved');
create type mail_match as enum ('package', 'name', 'manual');

create or replace function is_importing() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('app.importing', true), ''), '0') = '1'
$$;

create or replace function set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------- logins ----

create table users (
  id            text        primary key default gen_random_uuid()::text,
  email         text        not null,
  password_hash text        not null,
  name          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

create table team_members (
  id         text        primary key default gen_random_uuid()::text,
  user_id    text        unique references users (id) on delete set null,
  name       text        not null,
  email      text,
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------- clients ----

create table clients (
  id       text    primary key default gen_random_uuid()::text,
  ticket   text    not null,
  name     text    not null,
  note     text,
  archived boolean not null default false,

  play_privacy_url          text,
  play_delete_account_url   text,
  play_contact_email        text,
  play_listing_email        text,
  play_contact_phone        text,
  play_website              text,
  play_default_language     text,
  store_support_url         text,
  store_marketing_url       text,
  review_contact_first_name text,
  review_contact_last_name  text,
  review_contact_phone      text,
  review_contact_email      text,

  intake_token        text unique,
  intake_submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_ticket_key on clients (lower(ticket));

create table publisher_accounts (
  id           text         primary key default gen_random_uuid()::text,
  client_id    text         not null references clients (id) on delete cascade,
  platform     platform     not null,
  account_name text         not null default '',
  account_type account_type not null default 'organization',
  note         text,

  access_method  access_method,
  access_email   text,
  login_password text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, platform)
);

create table releases (
  id          text        primary key default gen_random_uuid()::text,
  client_id   text        not null references clients (id) on delete cascade,
  version     text,
  title       text,
  assigned_to text        references team_members (id) on delete set null,
  note        text,
  started_on  date        not null default current_date,
  released_on date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index releases_client_id_idx on releases (client_id);
create index releases_assigned_to_idx on releases (assigned_to);

create table keystores (
  id         text        primary key default gen_random_uuid()::text,
  client_id  text        not null references clients (id) on delete cascade,
  name       text        not null default 'Keystore',
  details    text,
  file_path  text,
  file_name  text,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index keystores_client_id_idx on keystores (client_id);

-- ------------------------------------------------------------------ apps ----

create table products (
  id           text    primary key default gen_random_uuid()::text,
  client_id    text    not null references clients (id) on delete cascade,
  account_id   text    not null references publisher_accounts (id) on delete cascade,
  project_name text    not null,
  app_name     text    not null default '',
  keystore_id  text    references keystores (id) on delete set null,
  store_url    text,
  note         text,
  sort_order   integer not null default 0,
  archived     boolean not null default false,

  package_name      text,
  play_category     text,
  short_description text,
  long_description  text,
  demo_instructions text,
  demo_login        text,
  demo_password     text,
  demo_details      text,
  ios_sku                text,
  ios_subtitle           text,
  ios_keywords           text,
  ios_promo_text         text,
  ios_primary_category   text,
  ios_secondary_category text,
  ios_copyright          text,

  publishing_countries text,
  feature_graphic_url  text,
  screenshots_url      text,
  icon_url             text,
  client_note          text,

  store_live       boolean,
  store_version    text,
  store_updated_at timestamptz,
  store_checked_at timestamptz,
  store_error      text,
  store_country    text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_account_project_key on products (account_id, lower(project_name));
create index products_client_id_idx on products (client_id);
create index products_keystore_id_idx on products (keystore_id);

create table apps (
  id                text        primary key default gen_random_uuid()::text,
  release_id        text        not null references releases (id) on delete cascade,
  product_id        text        not null references products (id) on delete cascade,
  account_id        text        not null references publisher_accounts (id) on delete cascade,
  project_name      text        not null,
  app_name          text        not null default '',
  status            app_status  not null default 'ongoing',
  assigned_to       text        references team_members (id) on delete set null,
  build_version     text,
  flutter_version   text,
  keystore_id       text        references keystores (id) on delete set null,
  jks               text,
  jks_file_path     text,
  jks_file_name     text,
  store_url         text,
  note              text,
  sort_order        integer     not null default 0,
  status_changed_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index apps_release_id_idx on apps (release_id);
create index apps_product_id_idx on apps (product_id, created_at desc);
create index apps_account_id_idx on apps (account_id);
create index apps_assigned_to_idx on apps (assigned_to);
create index apps_keystore_id_idx on apps (keystore_id);

create table app_events (
  id          text        primary key default gen_random_uuid()::text,
  app_id      text        not null references apps (id) on delete cascade,
  kind        text        not null,
  from_status app_status,
  to_status   app_status,
  message     text,
  actor       text,
  created_at  timestamptz not null default now()
);
create index app_events_app_created_idx on app_events (app_id, created_at);
create index app_events_created_idx on app_events (created_at desc);

-- -------------------------------------------------------------- support ----

create table support_articles (
  id         text        primary key default gen_random_uuid()::text,
  category   text        not null default 'General',
  title      text        not null,
  body       text        not null,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------- product lines ----

create table product_lines (
  id         text        primary key default gen_random_uuid()::text,
  name       text        not null,
  logo_path  text,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_lines_name_key on product_lines (lower(name));

create table product_line_projects (
  id                text        primary key default gen_random_uuid()::text,
  line_id           text        not null references product_lines (id) on delete cascade,
  project_name      text        not null,
  sort_order        integer     not null default 0,
  short_description text,
  long_description  text,
  created_at        timestamptz not null default now()
);
create unique index product_line_projects_project_key on product_line_projects (lower(project_name));
create index product_line_projects_line_id_idx on product_line_projects (line_id);

-- ------------------------------------------------------------ store mail ----

create table mail_tickets (
  id            text          primary key default gen_random_uuid()::text,
  number        integer       generated by default as identity unique,
  topic         text          not null,
  product_id    text          references products (id) on delete set null,
  source        mail_source   not null,
  kind          text          not null,
  app_label     text,
  label_key     text,
  subject       text          not null default '',
  status        ticket_status not null default 'open',
  assigned_to   text          references team_members (id) on delete set null,
  assigned_at   timestamptz,
  assigned_by   text,
  mail_count    integer       not null default 0,
  first_mail_at timestamptz   not null,
  last_mail_at  timestamptz   not null,
  opened_at     timestamptz   not null default now(),
  resolved_at   timestamptz,
  resolved_by   text,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);
create index mail_tickets_topic_idx on mail_tickets (topic, created_at);
create index mail_tickets_status_idx on mail_tickets (status, last_mail_at);
create index mail_tickets_opened_idx on mail_tickets (opened_at);
create index mail_tickets_label_idx on mail_tickets (label_key);
create index mail_tickets_product_idx on mail_tickets (product_id);
create index mail_tickets_assigned_to_idx on mail_tickets (assigned_to);

create table mail_ticket_events (
  id         text        primary key default gen_random_uuid()::text,
  ticket_id  text        not null references mail_tickets (id) on delete cascade,
  kind       text        not null,
  body       text,
  actor      text,
  created_at timestamptz not null default now()
);
create index mail_ticket_events_ticket_idx on mail_ticket_events (ticket_id, created_at);

create table store_mails (
  id              text        primary key default gen_random_uuid()::text,
  gmail_id        text        not null,
  thread_id       text,
  mailbox         text        not null,
  product_id      text        references products (id) on delete set null,
  ticket_id       text        references mail_tickets (id) on delete set null,
  matched_by      mail_match,
  source          mail_source not null,
  kind            text        not null,
  action_required boolean     not null default false,
  app_label       text,
  label_key       text,
  topic           text        not null,
  sender          text        not null default '',
  subject         text        not null default '',
  snippet         text,
  received_at     timestamptz not null,
  created_at      timestamptz not null default now(),
  unique (mailbox, gmail_id)
);
create index store_mails_product_idx on store_mails (product_id, received_at);
create index store_mails_ticket_idx on store_mails (ticket_id, received_at);
create index store_mails_label_idx on store_mails (label_key);

create table mail_syncs (
  id        text        primary key default gen_random_uuid()::text,
  mailbox   text        not null,
  synced_by text        not null,
  newest_at timestamptz,
  fetched   integer     not null default 0,
  saved     integer     not null default 0,
  synced_at timestamptz not null default now(),
  unique (mailbox, synced_by)
);

-- -------------------------------------------------------------- triggers ----
-- Every trigger stands down while app.importing = '1' (set per transaction),
-- so loading prepared data doesn't add history or team members twice.

do $$
declare t text;
begin
  foreach t in array array['users', 'team_members', 'clients', 'publisher_accounts', 'releases',
                           'keystores', 'products', 'apps', 'support_articles', 'product_lines',
                           'mail_tickets']
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end
$$;

-- A release counts as released the day every app in it is live; that date
-- stays put on later edits, and clears if an app goes back.
create or replace function sync_release_released_on(target text) returns void
language plpgsql set search_path = public as $$
declare
  total integer;
  pending integer;
begin
  select count(*), count(*) filter (where status <> 'production')
    into total, pending
    from apps where release_id = target;
  update releases
     set released_on = case when total > 0 and pending = 0
                            then coalesce(released_on, current_date) end
   where id = target;
end
$$;

-- A new login gets its team member, named after the email until renamed.
create or replace function users_create_team_member() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_importing() then
    insert into team_members (user_id, name, email)
    values (new.id, coalesce(nullif(trim(new.name), ''), split_part(new.email, '@', 1)), new.email)
    on conflict do nothing;
  end if;
  return new;
end
$$;
create trigger users_create_team_member after insert on users
  for each row execute function users_create_team_member();

-- A submission always mirrors its product's identity; a status change also
-- stamps when it happened and goes into the history, credited to the assignee.
create or replace function apps_before_write() returns trigger
language plpgsql set search_path = public as $$
declare p products%rowtype;
begin
  if is_importing() then
    return new;
  end if;
  select * into p from products where id = new.product_id;
  if not found then
    raise exception 'That app does not exist.';
  end if;
  new.account_id   := p.account_id;
  new.project_name := p.project_name;
  new.app_name     := p.app_name;
  new.keystore_id  := p.keystore_id;
  new.store_url    := p.store_url;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
    insert into app_events (app_id, kind, from_status, to_status, actor)
    values (new.id, 'status', old.status, new.status,
            (select name from team_members where id = new.assigned_to));
  end if;
  return new;
end
$$;
create trigger apps_before_write before insert or update on apps
  for each row execute function apps_before_write();

create or replace function apps_after_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if is_importing() then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into app_events (app_id, kind, to_status, message, actor)
    values (new.id, 'created', new.status, 'App added',
            (select name from team_members where id = new.assigned_to));
    perform sync_release_released_on(new.release_id);
  elsif tg_op = 'UPDATE' then
    perform sync_release_released_on(new.release_id);
    if new.release_id is distinct from old.release_id then
      perform sync_release_released_on(old.release_id);
    end if;
  else
    perform sync_release_released_on(old.release_id);
  end if;
  return null;
end
$$;
create trigger apps_after_write after insert or update or delete on apps
  for each row execute function apps_after_write();

-- Editing an app (product) updates every submission of it.
create or replace function products_sync_apps() returns trigger
language plpgsql set search_path = public as $$
begin
  if is_importing() then
    return null;
  end if;
  if (new.account_id, new.project_name, new.app_name, new.keystore_id, new.store_url)
     is distinct from
     (old.account_id, old.project_name, old.app_name, old.keystore_id, old.store_url) then
    update apps
       set account_id   = new.account_id,
           project_name = new.project_name,
           app_name     = new.app_name,
           keystore_id  = new.keystore_id,
           store_url    = new.store_url
     where product_id = new.id;
  end if;
  return null;
end
$$;
create trigger products_sync_apps after update on products
  for each row execute function products_sync_apps();

-- ------------------------------------------------------------------- RLS ----

do $$
declare t text;
begin
  foreach t in array array['users', 'team_members', 'clients', 'publisher_accounts', 'releases',
                           'keystores', 'products', 'apps', 'app_events', 'support_articles',
                           'product_lines', 'product_line_projects', 'mail_tickets',
                           'mail_ticket_events', 'store_mails', 'mail_syncs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
end
$$;

revoke execute on all functions in schema public from anon, authenticated, public;

-- --------------------------------------------------------------- storage ----

insert into storage.buckets (id, name, public)
values ('jks', 'jks', false), ('logos', 'logos', false)
on conflict (id) do nothing;
