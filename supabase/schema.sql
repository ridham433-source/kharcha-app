-- Kharcha / Splitter: free shared-group storage.
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists public.shared_groups (
  code        text primary key,
  data        jsonb not null,
  version     integer not null default 1,
  updated_at  timestamptz not null default now()
);

-- Lock the table. Nobody can read or list it directly.
-- The app only talks to it through the two functions below, and it needs the group's secret code.
alter table public.shared_groups enable row level security;

create or replace function public.get_group(p_code text)
returns table (data jsonb, version integer)
language sql
security definer
set search_path = public
as $$
  select g.data, g.version from public.shared_groups g where g.code = p_code;
$$;

-- p_expected = 0  -> create a new group
-- p_expected = N  -> update only if the server is still at version N
-- Returns the new version, or -1 if someone else saved first (the app then merges and retries).
create or replace function public.put_group(p_code text, p_data jsonb, p_expected integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  if length(p_code) < 8 then
    raise exception 'code too short';
  end if;
  if pg_column_size(p_data) > 1000000 then
    raise exception 'group too large';
  end if;

  if p_expected = 0 then
    insert into public.shared_groups (code, data, version)
    values (p_code, p_data, 1)
    on conflict (code) do nothing;
    if found then
      return 1;
    end if;
    return -1;
  end if;

  update public.shared_groups
     set data = p_data, version = version + 1, updated_at = now()
   where code = p_code and version = p_expected
  returning version into v;

  if v is null then
    return -1;
  end if;
  return v;
end;
$$;

revoke all on function public.get_group(text) from public;
revoke all on function public.put_group(text, jsonb, integer) from public;
grant execute on function public.get_group(text) to anon;
grant execute on function public.put_group(text, jsonb, integer) to anon;
