create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency text not null default 'BRL',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_members (organization_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (organization_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
after insert on public.organizations
for each row execute function public.create_owner_membership();

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members members
    where members.organization_id = target_organization_id
      and members.user_id = auth.uid()
  );
$$;

create or replace function public.org_member_role(target_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select members.role
  from public.organization_members members
  where members.organization_id = target_organization_id
    and members.user_id = auth.uid()
  limit 1;
$$;

create table if not exists public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('mercadolivre', 'amazon', 'shopee', 'magalu', 'custom')),
  external_seller_id text not null,
  account_name text not null,
  site_id text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'expired', 'disabled')),
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, external_seller_id)
);

create table if not exists public.marketplace_account_credentials (
  account_id uuid primary key references public.marketplace_accounts(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  internal_sku text not null,
  title text not null,
  brand text,
  category text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, internal_sku)
);

create table if not exists public.sku_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  cost_name text not null,
  cost_category text not null check (cost_category in ('product', 'packaging', 'inbound_freight', 'tax', 'marketplace_fixed', 'other')),
  allocation_method text not null default 'per_unit' check (allocation_method in ('per_unit', 'percentage', 'per_order')),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'BRL',
  valid_from date not null,
  valid_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  provider text not null check (provider in ('mercadolivre', 'amazon', 'shopee', 'magalu', 'custom')),
  external_item_id text not null,
  seller_sku text,
  title text not null,
  permalink text,
  listing_type text,
  fulfillment_type text,
  status text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_account_id, external_item_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  provider_order_id text not null,
  sold_at timestamptz not null,
  status text not null,
  buyer_state text,
  gross_amount numeric(14, 2) not null default 0,
  marketplace_fee_amount numeric(14, 2) not null default 0,
  shipping_cost_amount numeric(14, 2) not null default 0,
  discounts_amount numeric(14, 2) not null default 0,
  taxes_amount numeric(14, 2) not null default 0,
  net_amount numeric(14, 2) not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (marketplace_account_id, provider_order_id)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  marketplace_listing_id uuid references public.marketplace_listings(id) on delete set null,
  external_item_id text,
  seller_sku text,
  title text not null,
  quantity numeric(12, 2) not null default 0,
  unit_price numeric(14, 2) not null default 0,
  gross_amount numeric(14, 2) not null default 0,
  marketplace_fee_amount numeric(14, 2) not null default 0,
  shipping_cost_amount numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marketplace_account_id uuid not null references public.marketplace_accounts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  external_item_id text,
  seller_sku text,
  fulfillment_channel text not null,
  available_quantity integer not null default 0,
  reserved_quantity integer not null default 0,
  not_available_quantity integer not null default 0,
  captured_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

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

create index if not exists marketplace_accounts_organization_idx on public.marketplace_accounts (organization_id);
create index if not exists products_organization_idx on public.products (organization_id);
create index if not exists sku_costs_product_validity_idx on public.sku_costs (product_id, valid_from, valid_to);
create index if not exists marketplace_listings_product_idx on public.marketplace_listings (product_id);
create index if not exists orders_sold_at_idx on public.orders (organization_id, sold_at desc);
create index if not exists order_items_sku_idx on public.order_items (organization_id, seller_sku);
create index if not exists inventory_snapshots_lookup_idx on public.inventory_snapshots (organization_id, seller_sku, captured_at desc);
create index if not exists advertising_metrics_date_idx on public.advertising_metrics (organization_id, metric_date desc);
create index if not exists contribution_margin_period_idx on public.contribution_margin_snapshots (organization_id, period_start, period_end);
create index if not exists sync_runs_status_idx on public.sync_runs (organization_id, status, started_at desc);
create index if not exists marketplace_events_lookup_idx on public.marketplace_events (provider, external_user_id, topic, received_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_accounts_set_updated_at on public.marketplace_accounts;
create trigger marketplace_accounts_set_updated_at before update on public.marketplace_accounts
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_account_credentials_set_updated_at on public.marketplace_account_credentials;
create trigger marketplace_account_credentials_set_updated_at before update on public.marketplace_account_credentials
for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists sku_costs_set_updated_at on public.sku_costs;
create trigger sku_costs_set_updated_at before update on public.sku_costs
for each row execute function public.set_updated_at();

drop trigger if exists marketplace_listings_set_updated_at on public.marketplace_listings;
create trigger marketplace_listings_set_updated_at before update on public.marketplace_listings
for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists advertising_campaigns_set_updated_at on public.advertising_campaigns;
create trigger advertising_campaigns_set_updated_at before update on public.advertising_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists promotions_set_updated_at on public.promotions;
create trigger promotions_set_updated_at before update on public.promotions
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.marketplace_accounts enable row level security;
alter table public.marketplace_account_credentials enable row level security;
alter table public.products enable row level security;
alter table public.sku_costs enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_snapshots enable row level security;
alter table public.advertising_campaigns enable row level security;
alter table public.advertising_metrics enable row level security;
alter table public.promotions enable row level security;
alter table public.contribution_margin_snapshots enable row level security;
alter table public.sync_runs enable row level security;
alter table public.marketplace_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations for select
using (public.is_org_member(id));

drop policy if exists "organizations_insert_creator" on public.organizations;
create policy "organizations_insert_creator" on public.organizations for insert
with check (created_by = auth.uid());

drop policy if exists "organizations_update_member" on public.organizations;
create policy "organizations_update_member" on public.organizations for update
using (public.is_org_member(id))
with check (public.org_member_role(id) in ('owner', 'admin'));

drop policy if exists "organization_members_select_member" on public.organization_members;
create policy "organization_members_select_member" on public.organization_members for select
using (public.is_org_member(organization_id));

drop policy if exists "organization_members_insert_member" on public.organization_members;
create policy "organization_members_insert_member" on public.organization_members for insert
with check (public.org_member_role(organization_id) in ('owner', 'admin'));

drop policy if exists "organization_members_update_member" on public.organization_members;
create policy "organization_members_update_member" on public.organization_members for update
using (public.org_member_role(organization_id) in ('owner', 'admin'))
with check (public.org_member_role(organization_id) in ('owner', 'admin'));

drop policy if exists "organization_members_delete_member" on public.organization_members;
create policy "organization_members_delete_member" on public.organization_members for delete
using (public.org_member_role(organization_id) in ('owner', 'admin'));

drop policy if exists "marketplace_accounts_org_member" on public.marketplace_accounts;
create policy "marketplace_accounts_org_member" on public.marketplace_accounts for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "products_org_member" on public.products;
create policy "products_org_member" on public.products for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "sku_costs_org_member" on public.sku_costs;
create policy "sku_costs_org_member" on public.sku_costs for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "marketplace_listings_org_member" on public.marketplace_listings;
create policy "marketplace_listings_org_member" on public.marketplace_listings for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "orders_org_member" on public.orders;
create policy "orders_org_member" on public.orders for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "order_items_org_member" on public.order_items;
create policy "order_items_org_member" on public.order_items for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "inventory_snapshots_org_member" on public.inventory_snapshots;
create policy "inventory_snapshots_org_member" on public.inventory_snapshots for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "advertising_campaigns_org_member" on public.advertising_campaigns;
create policy "advertising_campaigns_org_member" on public.advertising_campaigns for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "advertising_metrics_org_member" on public.advertising_metrics;
create policy "advertising_metrics_org_member" on public.advertising_metrics for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "promotions_org_member" on public.promotions;
create policy "promotions_org_member" on public.promotions for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "contribution_margin_snapshots_org_member" on public.contribution_margin_snapshots;
create policy "contribution_margin_snapshots_org_member" on public.contribution_margin_snapshots for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "sync_runs_org_member" on public.sync_runs;
create policy "sync_runs_org_member" on public.sync_runs for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

drop policy if exists "marketplace_events_org_member" on public.marketplace_events;
create policy "marketplace_events_org_member" on public.marketplace_events for select
using (organization_id is not null and public.is_org_member(organization_id));

drop view if exists public.v_sku_contribution_margin_current;
create view public.v_sku_contribution_margin_current
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
