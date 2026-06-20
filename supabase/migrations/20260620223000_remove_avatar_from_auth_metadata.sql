create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key
);

alter table supabase_migrations.schema_migrations
  add column if not exists name text,
  add column if not exists statements text[];

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'avatar_url'
where raw_user_meta_data ? 'avatar_url';

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate_username text;
  suffix text;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-zA-Z0-9_]', '_', 'g'));
  suffix := substr(replace(new.id::text, '-', ''), 1, 8);

  if char_length(base_username) < 3 then
    base_username := 'usuario_' || suffix;
  end if;

  base_username := left(base_username, 32);
  candidate_username := base_username;

  if exists (select 1 from public.profiles where lower(username) = lower(candidate_username)) then
    candidate_username := left(base_username, 23) || '_' || suffix;
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    candidate_username,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict do nothing;

  return new;
end;
$$;

insert into supabase_migrations.schema_migrations (version, name, statements)
values (
  '20260620223000',
  'remove_avatar_from_auth_metadata',
  array['Removes base64 avatar data from auth user metadata so JWT Authorization headers stay below Cloudflare limits.']
)
on conflict (version) do update
set
  name = excluded.name,
  statements = excluded.statements;
