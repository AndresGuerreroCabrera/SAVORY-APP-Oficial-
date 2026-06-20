create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 32),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]+$')
);

create unique index if not exists profiles_username_unique_lower
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles
  for select
  using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

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
  values (new.id, candidate_username, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

with normalized_users as (
  select
    users.id,
    nullif(users.raw_user_meta_data ->> 'display_name', '') as display_name,
    case
      when char_length(lower(regexp_replace(coalesce(users.raw_user_meta_data ->> 'username', ''), '[^a-zA-Z0-9_]', '_', 'g'))) >= 3
        then left(lower(regexp_replace(coalesce(users.raw_user_meta_data ->> 'username', ''), '[^a-zA-Z0-9_]', '_', 'g')), 32)
      else 'usuario_' || substr(replace(users.id::text, '-', ''), 1, 8)
    end as base_username
  from auth.users as users
),
deduplicated_users as (
  select
    id,
    display_name,
    case
      when row_number() over (partition by lower(base_username) order by id) = 1
        then base_username
      else left(base_username, 23) || '_' || substr(replace(id::text, '-', ''), 1, 8)
    end as username
  from normalized_users
)
insert into public.profiles (id, username, display_name)
select id, username, display_name
from deduplicated_users
on conflict do nothing;
