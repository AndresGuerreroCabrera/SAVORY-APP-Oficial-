alter table public.profiles
  add column if not exists avatar_url text;

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

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate_username,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict do nothing;

  return new;
end;
$$;
