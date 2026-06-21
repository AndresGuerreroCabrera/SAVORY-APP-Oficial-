create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.group_restaurants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete cascade,
  google_place_id text not null,
  name text not null,
  address text,
  phone text,
  website text,
  google_types text[] not null default '{}',
  location_lat double precision,
  location_lng double precision,
  status text not null check (status in ('want_to_go', 'visited')),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  cuisine_types text[] not null default '{}',
  dish_photos jsonb not null default '[]'::jsonb,
  food_rating numeric not null default 0 check (food_rating >= 0 and food_rating <= 10),
  occasion_types text[] not null default '{}',
  local_photos jsonb not null default '[]'::jsonb,
  price_range text,
  service_comment text,
  general_comment text,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  visit_history jsonb not null default '[]'::jsonb,
  unique (group_id, google_place_id, status)
);

create index if not exists groups_owner_id_idx on public.groups(owner_id);
create index if not exists group_members_group_id_idx on public.group_members(group_id);
create index if not exists group_members_user_id_idx on public.group_members(user_id);
create index if not exists group_restaurants_group_status_idx on public.group_restaurants(group_id, status);
create index if not exists group_restaurants_place_idx on public.group_restaurants(google_place_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_group_member(target_group_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = target_user_id
  );
$$;

drop trigger if exists groups_touch_updated_at on public.groups;
create trigger groups_touch_updated_at
before update on public.groups
for each row execute function public.touch_updated_at();

drop trigger if exists group_restaurants_touch_updated_at on public.group_restaurants;
create trigger group_restaurants_touch_updated_at
before update on public.group_restaurants
for each row execute function public.touch_updated_at();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_restaurants enable row level security;

drop policy if exists "Group members can read groups" on public.groups;
create policy "Group members can read groups"
on public.groups
for select
using (
  owner_id = auth.uid()
  or public.is_group_member(groups.id, auth.uid())
);

drop policy if exists "Authenticated users can create groups" on public.groups;
create policy "Authenticated users can create groups"
on public.groups
for insert
with check (owner_id = auth.uid());

drop policy if exists "Owners can update groups" on public.groups;
create policy "Owners can update groups"
on public.groups
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Owners can delete groups" on public.groups;
create policy "Owners can delete groups"
on public.groups
for delete
using (owner_id = auth.uid());

drop policy if exists "Group members can read memberships" on public.group_members;
create policy "Group members can read memberships"
on public.group_members
for select
using (
  user_id = auth.uid()
  or public.is_group_member(group_members.group_id, auth.uid())
  or exists (
    select 1
    from public.groups g
    where g.id = group_members.group_id
      and g.owner_id = auth.uid()
  )
);

drop policy if exists "Owners can add group members" on public.group_members;
create policy "Owners can add group members"
on public.group_members
for insert
with check (
  exists (
    select 1
    from public.groups g
    where g.id = group_members.group_id
      and g.owner_id = auth.uid()
  )
  and (
    (group_members.user_id = auth.uid() and group_members.role = 'owner')
    or exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.receiver_id = group_members.user_id)
          or (f.receiver_id = auth.uid() and f.requester_id = group_members.user_id)
        )
    )
  )
  and (group_members.user_id = auth.uid() or group_members.role = 'member')
);

drop policy if exists "Owners can remove group members" on public.group_members;
create policy "Owners can remove group members"
on public.group_members
for delete
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.groups g
    where g.id = group_members.group_id
      and g.owner_id = auth.uid()
  )
);

drop policy if exists "Group members can read restaurants" on public.group_restaurants;
create policy "Group members can read restaurants"
on public.group_restaurants
for select
using (
  public.is_group_member(group_restaurants.group_id, auth.uid())
);

drop policy if exists "Group members can add restaurants" on public.group_restaurants;
create policy "Group members can add restaurants"
on public.group_restaurants
for insert
with check (
  added_by = auth.uid()
  and public.is_group_member(group_restaurants.group_id, auth.uid())
);

drop policy if exists "Group members can update restaurants" on public.group_restaurants;
create policy "Group members can update restaurants"
on public.group_restaurants
for update
using (
  public.is_group_member(group_restaurants.group_id, auth.uid())
)
with check (
  public.is_group_member(group_restaurants.group_id, auth.uid())
);

drop policy if exists "Group members can delete restaurants" on public.group_restaurants;
create policy "Group members can delete restaurants"
on public.group_restaurants
for delete
using (
  public.is_group_member(group_restaurants.group_id, auth.uid())
);
