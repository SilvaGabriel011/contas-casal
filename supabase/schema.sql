-- Contas do Casal — Supabase schema
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase e clique em RUN.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bill', 'subscription', 'installment')),
  name text not null,
  category text not null default 'other',
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null check (currency in ('AUD', 'BRL')),
  owner text not null check (owner in ('a', 'b', 'shared')),
  frequency text not null check (frequency in ('weekly', 'fortnightly', 'monthly', 'yearly', 'once')),
  start_date date not null,
  installments_total integer check (installments_total is null or installments_total > 0),
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  owner text not null check (owner in ('a', 'b', 'shared')),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null check (currency in ('AUD', 'BRL')),
  frequency text not null check (frequency in ('weekly', 'fortnightly', 'monthly')),
  next_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  due_date date not null,
  paid_at timestamptz not null default now(),
  amount numeric(12, 2) not null check (amount >= 0),
  unique (user_id, item_id, due_date)
);

create table if not exists public.app_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security: cada conta (o login compartilhado do casal) só vê os próprios dados.
alter table public.items enable row level security;
alter table public.incomes enable row level security;
alter table public.payments enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "own items" on public.items;
create policy "own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own incomes" on public.incomes;
create policy "own incomes" on public.incomes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own settings" on public.app_settings;
create policy "own settings" on public.app_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: os dois celulares atualizam na hora.
do $$
begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.incomes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.payments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.app_settings;
exception when duplicate_object then null;
end $$;
