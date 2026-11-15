alter table mail_tickets add column if not exists read_at timestamptz;
alter table mail_tickets add column if not exists read_by text;
