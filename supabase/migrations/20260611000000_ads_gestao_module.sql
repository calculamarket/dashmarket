-- ============================================================
-- Módulo Gestão de ADS por Fase
-- ============================================================
-- Todas as tabelas incluem organization_id para suporte a RLS
-- multi-tenant seguindo o padrão is_org_member() do projeto.
-- ============================================================

-- Configurações por produto (inserida manualmente pelo usuário)
create table if not exists public.ads_product_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- item_id = seller_sku (padrão usado em toda a app)
  item_id text not null,
  title text,
  breakeven_acos numeric(5, 2) not null default 30.00,
  meta_vendas_diaria numeric(10, 3) not null default 1.000,
  meta_tacos numeric(5, 2) not null default 10.00,
  ativo boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, item_id)
);

-- Cache dos dados calculados por período
create table if not exists public.ads_metrics_cache (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id text not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  gasto_ads numeric(12, 2) default 0,
  receita_ads numeric(12, 2) default 0,
  receita_total numeric(12, 2) default 0,
  vendas_total integer default 0,
  vendas_ads integer default 0,
  impressoes integer default 0,
  cliques integer default 0,
  acos numeric(5, 2),
  tacos numeric(5, 2),
  taxa_organica numeric(5, 2),
  velocidade_vendas numeric(10, 3),
  fase text,
  recomendacao text,
  calculado_em timestamptz not null default now(),
  unique (organization_id, item_id, periodo_inicio, periodo_fim)
);

-- Histórico de mudanças de fase (para análise de tendência)
create table if not exists public.ads_phase_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id text not null,
  fase_anterior text,
  fase_nova text not null,
  acos_no_momento numeric(5, 2),
  tacos_no_momento numeric(5, 2),
  taxa_organica_no_momento numeric(5, 2),
  registrado_em timestamptz not null default now()
);

-- Índices
create index if not exists idx_ads_settings_org
  on public.ads_product_settings (organization_id);

create index if not exists idx_ads_metrics_org_item
  on public.ads_metrics_cache (organization_id, item_id);

create index if not exists idx_ads_metrics_periodo
  on public.ads_metrics_cache (periodo_inicio, periodo_fim);

create index if not exists idx_ads_phase_history_org_item
  on public.ads_phase_history (organization_id, item_id);

-- RLS
alter table public.ads_product_settings enable row level security;
alter table public.ads_metrics_cache enable row level security;
alter table public.ads_phase_history enable row level security;

create policy "ads_product_settings_org_member"
on public.ads_product_settings for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy "ads_metrics_cache_org_member"
on public.ads_metrics_cache for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy "ads_phase_history_org_member"
on public.ads_phase_history for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));
