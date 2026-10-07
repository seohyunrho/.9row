-- Run once in the dedicated .9row Supabase project. Contains no user data or keys.
begin;

create table if not exists public.moa_workspaces (
  id text primary key check (id in ('personal', 'demo')),
  revision bigint not null default 0 check (revision >= 0 and revision <= 9007199254740991),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);

alter table public.moa_workspaces enable row level security;
alter table public.moa_workspaces force row level security;
revoke all on table public.moa_workspaces from public, anon, authenticated;
revoke all on table public.moa_workspaces from service_role;
grant usage on schema public to service_role;
grant select, insert, update on table public.moa_workspaces to service_role;

-- No browser-facing policies. Only the protected Vercel server may read/write.
comment on table public.moa_workspaces is 'Private single-owner workspaces. Access only through protected server routes.';

commit;
