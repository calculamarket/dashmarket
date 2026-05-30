do $$
begin
  if to_regclass('public.organizations') is null
    or to_regclass('public.marketplace_accounts') is null
    or to_regclass('public.products') is null then
    raise exception 'Tabelas base nao encontradas. Execute a migration inicial desde o inicio antes deste reparo.';
  end if;
end $$;

create table if not exists public.advertising_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  provider_campaign_id text not null,
  name text not null,
  campaign_type text,
  status text,
  budget_amount numeric(14, 2),
  daily_goal_amount numeric(14, 2),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_account_id, provider_campaign_id)
);

create table if not exists public.advertising_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.advertising_campaigns(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  metric_date date not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  ad_spend_amount numeric(14, 2) not null default 0,
  attributed_revenue_amount numeric(14, 2) not null default 0,
  attributed_orders integer not null default 0,
  acos numeric(8, 4),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (campaign_id, product_id, metric_date)
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  provider_promotion_id text not null,
  name text not null,
  promotion_type text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  discount_amount numeric(14, 2),
  discount_percent numeric(8, 4),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_account_id, provider_promotion_id, product_id)
);

create table if not exists public.contribution_margin_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  units_sold numeric(12, 2) not null default 0,
  gross_revenue_amount numeric(14, 2) not null default 0,
  discounts_amount numeric(14, 2) not null default 0,
  marketplace_fees_amount numeric(14, 2) not null default 0,
  shipping_cost_amount numeric(14, 2) not null default 0,
  advertising_cost_amount numeric(14, 2) not null default 0,
  sku_cost_amount numeric(14, 2) not null default 0,
  contribution_margin_amount numeric(14, 2) not null default 0,
  contribution_margin_percent numeric(8, 4),
  raw_components jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, product_id, period_start, period_end),
  check (period_end >= period_start)
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete set null,
  provider text not null check (provider in ('mercadolivre', 'amazon', 'shopee', 'magalu', 'custom')),
  resource text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.marketplace_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete set null,
  provider text not null check (provider in ('mercadolivre', 'amazon', 'shopee', 'magalu', 'custom')),
  topic text not null,
  resource text not null,
  external_user_id text,
  attempts integer,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists advertising_metrics_date_idx on public.advertising_metrics (organization_id, metric_date desc);
create index if not exists contribution_margin_period_idx on public.contribution_margin_snapshots (organization_id, period_start, period_end);
create index if not exists sync_runs_status_idx on public.sync_runs (organization_id, status, started_at desc);
create index if not exists marketplace_events_lookup_idx on public.marketplace_events (provider, external_user_id, topic, received_at desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'advertising_campaigns_set_updated_at') then
    create trigger advertising_campaigns_set_updated_at
    before update on public.advertising_campaigns
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'promotions_set_updated_at') then
    create trigger promotions_set_updated_at
    before update on public.promotions
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.advertising_campaigns enable row level security;
alter table public.advertising_metrics enable row level security;
alter table public.promotions enable row level security;
alter table public.contribution_margin_snapshots enable row level security;
alter table public.sync_runs enable row level security;
alter table public.marketplace_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'advertising_campaigns'
      and policyname = 'advertising_campaigns_org_member'
  ) then
    create policy "advertising_campaigns_org_member"
    on public.advertising_campaigns for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'advertising_metrics'
      and policyname = 'advertising_metrics_org_member'
  ) then
    create policy "advertising_metrics_org_member"
    on public.advertising_metrics for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'promotions'
      and policyname = 'promotions_org_member'
  ) then
    create policy "promotions_org_member"
    on public.promotions for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contribution_margin_snapshots'
      and policyname = 'contribution_margin_snapshots_org_member'
  ) then
    create policy "contribution_margin_snapshots_org_member"
    on public.contribution_margin_snapshots for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sync_runs'
      and policyname = 'sync_runs_org_member'
  ) then
    create policy "sync_runs_org_member"
    on public.sync_runs for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'marketplace_events'
      and policyname = 'marketplace_events_org_member'
  ) then
    create policy "marketplace_events_org_member"
    on public.marketplace_events for select
    using (organization_id is not null and public.is_org_member(organization_id));
  end if;
end $$;

create or replace view public.v_sku_contribution_margin_current
with (security_invoker = true)
as
select distinct on (snapshots.organization_id, snapshots.product_id)
  snapshots.organization_id,
  snapshots.product_id,
  products.internal_sku,
  products.title,
  snapshots.period_start,
  snapshots.period_end,
  snapshots.units_sold,
  snapshots.gross_revenue_amount,
  snapshots.discounts_amount,
  snapshots.marketplace_fees_amount,
  snapshots.shipping_cost_amount,
  snapshots.advertising_cost_amount,
  snapshots.sku_cost_amount,
  snapshots.contribution_margin_amount,
  snapshots.contribution_margin_percent
from public.contribution_margin_snapshots snapshots
join public.products products on products.id = snapshots.product_id
order by snapshots.organization_id, snapshots.product_id, snapshots.period_end desc;
