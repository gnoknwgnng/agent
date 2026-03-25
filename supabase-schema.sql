create table if not exists public.accounts (
  id text primary key,
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

create unique index if not exists accounts_linkedin_member_id_unique
  on public.accounts (linkedin_member_id)
  where linkedin_member_id is not null;

create table if not exists public.schedules (
  id text primary key,
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

create index if not exists schedules_account_idx on public.schedules (account_id);

create table if not exists public.queue_items (
  id text primary key,
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

create index if not exists queue_items_account_idx on public.queue_items (account_id);
create index if not exists queue_items_schedule_time_idx on public.queue_items (status, scheduled_for);
