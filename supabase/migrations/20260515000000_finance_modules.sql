create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.company_financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  description text not null,
  category text not null default 'Operacional',
  entry_type text not null check (entry_type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount >= 0),
  due_date date not null,
  paid_at date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_financial_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  category text not null default 'Pessoal',
  entry_type text not null check (entry_type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount >= 0),
  due_date date not null,
  paid_at date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue')),
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_direction text not null check (loan_direction in ('lent', 'borrowed')),
  person_name text not null,
  description text not null,
  principal_amount numeric(14, 2) not null check (principal_amount >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  interest_rate numeric(8, 4) not null default 0 check (interest_rate >= 0),
  start_date date not null,
  due_date date not null,
  status text not null default 'active' check (status in ('active', 'settled', 'late')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_financial_entries_due_idx
on public.company_financial_entries (organization_id, due_date, status);

create index if not exists personal_financial_entries_due_idx
on public.personal_financial_entries (user_id, due_date, status);

create index if not exists personal_loans_due_idx
on public.personal_loans (user_id, due_date, status);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'company_financial_entries_set_updated_at'
  ) then
    create trigger company_financial_entries_set_updated_at
    before update on public.company_financial_entries
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'personal_financial_entries_set_updated_at'
  ) then
    create trigger personal_financial_entries_set_updated_at
    before update on public.personal_financial_entries
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'personal_loans_set_updated_at'
  ) then
    create trigger personal_loans_set_updated_at
    before update on public.personal_loans
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.company_financial_entries enable row level security;
alter table public.personal_financial_entries enable row level security;
alter table public.personal_loans enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'company_financial_entries'
      and policyname = 'company_financial_entries_org_member'
  ) then
    create policy "company_financial_entries_org_member"
    on public.company_financial_entries for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'personal_financial_entries'
      and policyname = 'personal_financial_entries_own'
  ) then
    create policy "personal_financial_entries_own"
    on public.personal_financial_entries for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'personal_loans'
      and policyname = 'personal_loans_own'
  ) then
    create policy "personal_loans_own"
    on public.personal_loans for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;
end $$;
