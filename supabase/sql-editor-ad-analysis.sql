-- DASHMARKET - tabelas para Analise de Anuncios e busca de oportunidades
-- Execute este arquivo no SQL Editor do Supabase antes de usar a nova aba.

create table if not exists public.listing_daily_analytics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  external_item_id text not null,
  seller_sku text,
  title text not null,
  category_id text,
  category_name text,
  captured_date date not null,
  visits integer not null default 0,
  previous_visits integer not null default 0,
  visit_change_percent numeric(10, 4),
  listing_position integer,
  previous_position integer,
  competitor_count integer not null default 0,
  estimated_sold_quantity integer not null default 0,
  status text,
  permalink text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_account_id, external_item_id, captured_date)
);

create table if not exists public.listing_exposure_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  analytics_id uuid references public.listing_daily_analytics(id) on delete cascade,
  external_item_id text not null,
  seller_sku text,
  title text not null,
  alert_date date not null,
  alert_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical', 'positive')),
  message text not null,
  current_value numeric(14, 4),
  previous_value numeric(14, 4),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (marketplace_account_id, external_item_id, alert_date, alert_type)
);

create table if not exists public.marketplace_product_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid references public.marketplace_accounts(id) on delete set null,
  provider text not null default 'mercadolivre',
  site_id text not null default 'MLB',
  category_id text not null,
  category_name text,
  query text,
  captured_at timestamptz not null default now(),
  external_item_id text not null,
  title text not null,
  price_amount numeric(14, 2) not null default 0,
  sold_quantity integer not null default 0,
  previous_sold_quantity integer not null default 0,
  estimated_daily_sales integer not null default 0,
  available_quantity integer not null default 0,
  seller_id text,
  seller_name text,
  competitor_count integer not null default 0,
  listing_position integer,
  permalink text,
  thumbnail text,
  raw_payload jsonb not null default '{}'::jsonb,
  unique (organization_id, category_id, external_item_id)
);

create index if not exists listing_daily_analytics_lookup_idx
on public.listing_daily_analytics (organization_id, captured_date desc, visits desc);

create index if not exists listing_daily_analytics_item_idx
on public.listing_daily_analytics (marketplace_account_id, external_item_id, captured_date desc);

create index if not exists listing_exposure_alerts_lookup_idx
on public.listing_exposure_alerts (organization_id, alert_date desc, severity);

create index if not exists marketplace_product_opportunities_lookup_idx
on public.marketplace_product_opportunities (organization_id, category_id, captured_at desc);

drop trigger if exists listing_daily_analytics_set_updated_at on public.listing_daily_analytics;
create trigger listing_daily_analytics_set_updated_at
before update on public.listing_daily_analytics
for each row execute function public.set_updated_at();

alter table public.listing_daily_analytics enable row level security;
alter table public.listing_exposure_alerts enable row level security;
alter table public.marketplace_product_opportunities enable row level security;

drop policy if exists "listing_daily_analytics_org_member" on public.listing_daily_analytics;
create policy "listing_daily_analytics_org_member"
on public.listing_daily_analytics for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "listing_exposure_alerts_org_member" on public.listing_exposure_alerts;
create policy "listing_exposure_alerts_org_member"
on public.listing_exposure_alerts for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "marketplace_product_opportunities_org_member" on public.marketplace_product_opportunities;
create policy "marketplace_product_opportunities_org_member"
on public.marketplace_product_opportunities for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));
