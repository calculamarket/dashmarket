create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.personal_loans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  paid_at date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists loan_payments_loan_idx
on public.loan_payments (loan_id, paid_at);

alter table public.loan_payments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'loan_payments'
      and policyname = 'loan_payments_own'
  ) then
    create policy "loan_payments_own"
    on public.loan_payments for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
  end if;
end $$;
