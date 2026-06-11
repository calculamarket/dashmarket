alter table public.products
  add column if not exists reference_net_profit numeric(14, 2),
  add column if not exists reference_profit_margin numeric(8, 4);
