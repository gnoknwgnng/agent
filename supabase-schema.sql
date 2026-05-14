create table if not exists public.accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'linkedin' check (platform = 'linkedin'),
  display_name text not null,
  access_token text not null,
  author_urn text not null,
  linkedin_member_id text,
  email text,
  profile_picture text,
  auth_type text not null default 'oauth',
  status text not null default 'connected',
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists accounts_user_id_idx on public.accounts (user_id);

drop index if exists accounts_linkedin_member_id_unique;
create unique index if not exists accounts_linkedin_member_per_user_unique
  on public.accounts (user_id, linkedin_member_id)
  where linkedin_member_id is not null;

create table if not exists public.schedules (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'linkedin' check (platform = 'linkedin'),
  account_id text not null references public.accounts(id) on delete cascade,
  company_name text not null,
  website text,
  industry text not null,
  services jsonb not null default '[]'::jsonb,
  country_code text not null default 'US',
  posts_per_week integer not null check (posts_per_week between 1 and 10),
  preferred_hour integer not null default 10 check (preferred_hour between 0 and 23),
  start_date timestamptz not null,
  end_date timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.schedules
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists schedules_user_id_idx on public.schedules (user_id);
create index if not exists schedules_account_idx on public.schedules (account_id);

create table if not exists public.queue_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_id text not null references public.schedules(id) on delete cascade,
  account_id text not null references public.accounts(id) on delete cascade,
  platform text not null default 'linkedin' check (platform = 'linkedin'),
  status text not null default 'scheduled' check (status in ('scheduled', 'publishing', 'published', 'failed')),
  scheduled_for timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  published_at timestamptz,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  provider_id text,
  provider_response jsonb,
  error text,
  error_status integer
);

alter table public.queue_items
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists queue_items_user_id_idx on public.queue_items (user_id);
create index if not exists queue_items_account_idx on public.queue_items (account_id);
create index if not exists queue_items_schedule_time_idx on public.queue_items (status, scheduled_for);

alter table public.accounts enable row level security;
alter table public.schedules enable row level security;
alter table public.queue_items enable row level security;

drop policy if exists accounts_owner_select on public.accounts;
create policy accounts_owner_select on public.accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists accounts_owner_insert on public.accounts;
create policy accounts_owner_insert on public.accounts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists accounts_owner_update on public.accounts;
create policy accounts_owner_update on public.accounts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists accounts_owner_delete on public.accounts;
create policy accounts_owner_delete on public.accounts
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists schedules_owner_select on public.schedules;
create policy schedules_owner_select on public.schedules
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists schedules_owner_insert on public.schedules;
create policy schedules_owner_insert on public.schedules
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists schedules_owner_update on public.schedules;
create policy schedules_owner_update on public.schedules
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists schedules_owner_delete on public.schedules;
create policy schedules_owner_delete on public.schedules
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists queue_items_owner_select on public.queue_items;
create policy queue_items_owner_select on public.queue_items
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists queue_items_owner_insert on public.queue_items;
create policy queue_items_owner_insert on public.queue_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists queue_items_owner_update on public.queue_items;
create policy queue_items_owner_update on public.queue_items
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists queue_items_owner_delete on public.queue_items;
create policy queue_items_owner_delete on public.queue_items
  for delete
  to authenticated
  using (auth.uid() = user_id);
