-- Adiciona colunas de conciliação de frete/repasse às tabelas já existentes.
-- Esta migration existe porque as colunas foram adicionadas à migration original
-- após ela já ter sido aplicada no Supabase.

alter table public.mp_reconciliation_batches
  add column if not exists total_shipping_difference numeric(14, 2) not null default 0;

alter table public.mp_payment_imports
  add column if not exists order_shipping_cost numeric(14, 2),
  add column if not exists shipping_difference numeric(14, 2) not null default 0;
