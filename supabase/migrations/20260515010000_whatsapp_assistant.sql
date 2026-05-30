create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  phone_number text not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_number)
);

create table if not exists public.whatsapp_message_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  phone_number text not null,
  message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  response_body text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (message_id)
);

create index if not exists whatsapp_contacts_org_idx
on public.whatsapp_contacts (organization_id, is_active);

create index if not exists whatsapp_message_logs_org_idx
on public.whatsapp_message_logs (organization_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'whatsapp_contacts_set_updated_at'
  ) then
    create trigger whatsapp_contacts_set_updated_at
    before update on public.whatsapp_contacts
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_message_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_contacts'
      and policyname = 'whatsapp_contacts_org_member'
  ) then
    create policy "whatsapp_contacts_org_member"
    on public.whatsapp_contacts for all
    using (public.is_org_member(organization_id))
    with check (public.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'whatsapp_message_logs'
      and policyname = 'whatsapp_message_logs_org_member_select'
  ) then
    create policy "whatsapp_message_logs_org_member_select"
    on public.whatsapp_message_logs for select
    using (
      organization_id is not null
      and public.is_org_member(organization_id)
    );
  end if;
end $$;
