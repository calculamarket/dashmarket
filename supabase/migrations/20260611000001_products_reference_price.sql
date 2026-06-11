alter table public.products
  add column if not exists reference_price numeric(14, 2);
