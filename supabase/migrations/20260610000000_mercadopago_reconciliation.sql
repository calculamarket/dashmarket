-- Conciliação Vendas (Mercado Livre) x Recebimentos (Mercado Pago)
-- Importação manual de extratos (CSV/XLSX) enquanto a integração via API do
-- Mercado Pago não está disponível. As tabelas guardam cada lote importado e
-- as linhas individuais já cruzadas com public.orders pelo número da venda no
-- Mercado Livre (order_id no relatório do MP == provider_order_id em orders).
--
-- Conciliação de Frete/Repasse:
-- shipping_cost_amount  = frete cobrado pelo MP no extrato (valor real descontado)
-- order_shipping_cost   = frete registrado no pedido ML pelo sistema
-- shipping_difference   = order_shipping_cost - ABS(shipping_cost_amount)
--   positivo → ML estimou frete maior que o MP descontou (saldo a favor)
--   negativo → MP descontou mais do que o ML estimou (custo extra / subsídio)

create table public.mp_reconciliation_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  period_from date,
  period_to date,
  total_rows integer not null default 0,
  matched_rows integer not null default 0,
  mismatched_rows integer not null default 0,
  unmatched_rows integer not null default 0,
  total_gross_amount numeric(14, 2) not null default 0,
  total_net_received_amount numeric(14, 2) not null default 0,
  total_shipping_difference numeric(14, 2) not null default 0,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.mp_payment_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null references public.mp_reconciliation_batches(id) on delete cascade,
  ml_order_id text,
  mp_operation_id text,
  external_reference text,
  item_id text,
  seller_sku text,
  description text,
  status text,
  status_detail text,
  operation_type text,
  purchase_date timestamptz,
  approved_date timestamptz,
  released_date timestamptz,
  gross_amount numeric(14, 2) not null default 0,
  mercadopago_fee_amount numeric(14, 2) not null default 0,
  marketplace_fee_amount numeric(14, 2) not null default 0,
  shipping_cost_amount numeric(14, 2) not null default 0,
  coupon_fee_amount numeric(14, 2) not null default 0,
  net_received_amount numeric(14, 2) not null default 0,
  refunded_amount numeric(14, 2) not null default 0,
  installments integer,
  payment_type text,
  matched_order_id uuid references public.orders(id) on delete set null,
  match_status text not null default 'unmatched'
    check (match_status in ('matched', 'amount_mismatch', 'unmatched')),
  amount_difference numeric(14, 2) not null default 0,
  order_shipping_cost numeric(14, 2),
  shipping_difference numeric(14, 2) not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index mp_payment_imports_batch_idx on public.mp_payment_imports (batch_id);
create index mp_payment_imports_org_idx on public.mp_payment_imports (organization_id);
create index mp_payment_imports_ml_order_idx on public.mp_payment_imports (organization_id, ml_order_id);
create index mp_payment_imports_match_status_idx on public.mp_payment_imports (organization_id, match_status);

alter table public.mp_reconciliation_batches enable row level security;
alter table public.mp_payment_imports enable row level security;

create policy "mp_reconciliation_batches_org_member"
on public.mp_reconciliation_batches for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));

create policy "mp_payment_imports_org_member"
on public.mp_payment_imports for all
using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));
