-- Contas do Casal — Supabase schema
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase e clique em RUN.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bill', 'subscription', 'installment', 'purchase')),
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
  hourly_rate numeric(12, 2),
  hours_per_day numeric(6, 2),
  days_per_week numeric(4, 2),
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

-- Migrações: seguras de rodar de novo em projetos que já usaram uma versão anterior deste arquivo.
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check
  check (kind in ('bill', 'subscription', 'installment', 'purchase'));
alter table public.incomes add column if not exists hourly_rate numeric(12, 2);
alter table public.incomes add column if not exists hours_per_day numeric(6, 2);
alter table public.incomes add column if not exists days_per_week numeric(4, 2);

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

-- Gastos variáveis do dia a dia (mercado, delivery, transporte…).
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null check (currency in ('AUD', 'BRL')),
  category text not null default 'other',
  owner text not null check (owner in ('a', 'b', 'shared')),
  paid_by text check (paid_by in ('a', 'b')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;
drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.expenses;
exception when duplicate_object then null;
end $$;

-- Remessas Austrália -> Brasil (Wise, Remitly…).
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  aud_sent numeric(12, 2) not null check (aud_sent > 0),
  brl_received numeric(12, 2) not null check (brl_received > 0),
  fee_aud numeric(12, 2),
  note text,
  created_at timestamptz not null default now()
);

alter table public.transfers enable row level security;
drop policy if exists "own transfers" on public.transfers;
create policy "own transfers" on public.transfers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.transfers;
exception when duplicate_object then null;
end $$;

-- Acerto do casal: quem efetivamente pagou cada conta.
alter table public.payments add column if not exists paid_by text check (paid_by in ('a', 'b'));

-- Calendário sincronizado (Apple/Google): o app cria um token secreto e o
-- endpoint /api/calendar serve um feed .ics com os lembretes de vencimento.
create table if not exists public.calendar_feeds (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  lang text not null default 'pt' check (lang in ('pt', 'en')),
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;
drop policy if exists "own feed" on public.calendar_feeds;
create policy "own feed" on public.calendar_feeds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Lida pelo feed usando apenas o token (capability URL): security definer
-- valida o token e devolve só os dados necessários para montar lembretes.
create or replace function public.calendar_feed_data(feed_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'lang', f.lang,
    'items', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'kind', i.kind,
          'amount', i.amount,
          'currency', i.currency,
          'frequency', i.frequency,
          'startDate', i.start_date,
          'installmentsTotal', i.installments_total,
          'paidDates', coalesce(
            (select jsonb_agg(p.due_date) from public.payments p where p.item_id = i.id),
            '[]'::jsonb
          )
        ))
        from public.items i
        where i.user_id = f.user_id and not i.archived
      ),
      '[]'::jsonb
    )
  )
  from public.calendar_feeds f
  where f.token = feed_token
$$;

revoke all on function public.calendar_feed_data(uuid) from public;
grant execute on function public.calendar_feed_data(uuid) to anon, authenticated;

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

-- ============================================================================
-- v3: notificações push + fotos de recibo
-- ============================================================================

-- Push: uma linha por aparelho inscrito. O cron da Vercel (api/notify) lê com
-- a service role e envia "pagar X amanhã".
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  lang text not null default 'pt',
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recibos: bucket privado, um arquivo por gasto ("<user_id>/<expense_id>.jpg").
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "own receipts" on storage.objects;
create policy "own receipts" on storage.objects
  for all
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- v4: máquina do tempo (backups automáticos)
-- ============================================================================

-- Um snapshot por dia por conta (cron da Vercel, api/backup); o app lista e
-- restaura com um toque. Mantém os últimos 30.
create table if not exists public.backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_at timestamptz not null default now(),
  data jsonb not null
);
alter table public.backups enable row level security;
drop policy if exists "own backups" on public.backups;
create policy "own backups" on public.backups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists backups_user_taken_idx on public.backups (user_id, taken_at desc);
