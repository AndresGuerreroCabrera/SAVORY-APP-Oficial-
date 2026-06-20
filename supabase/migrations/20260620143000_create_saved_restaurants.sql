create extension if not exists pgcrypto with schema extensions;

create table if not exists public.saved_restaurants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  google_place_id text not null,
  name text not null,
  address text,
  phone text,
  website text,
  google_types text[] not null default '{}',
  location_lat double precision,
  location_lng double precision,
  status text not null default 'want_to_go',
  visibility text not null default 'private',
  cuisine_types text[] not null default '{}',
  dish_photos jsonb not null default '[]'::jsonb,
  food_rating numeric(3,1) not null default 0,
  occasion_types text[] not null default '{}',
  local_photos jsonb not null default '[]'::jsonb,
  price_range text,
  service_comment text,
  general_comment text,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_restaurants_status_check check (status in ('want_to_go', 'visited')),
  constraint saved_restaurants_visibility_check check (visibility in ('private', 'public')),
  constraint saved_restaurants_rating_check check (food_rating >= 0 and food_rating <= 10),
  constraint saved_restaurants_unique_user_place_status unique (user_id, google_place_id, status)
);

alter table public.saved_restaurants enable row level security;

drop policy if exists "Saved restaurants are readable by owner or when public" on public.saved_restaurants;
create policy "Saved restaurants are readable by owner or when public"
  on public.saved_restaurants
  for select
  using (auth.uid() = user_id or visibility = 'public');

drop policy if exists "Users can save their own restaurants" on public.saved_restaurants;
create policy "Users can save their own restaurants"
  on public.saved_restaurants
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own saved restaurants" on public.saved_restaurants;
create policy "Users can update their own saved restaurants"
  on public.saved_restaurants
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own saved restaurants" on public.saved_restaurants;
create policy "Users can delete their own saved restaurants"
  on public.saved_restaurants
  for delete
  using (auth.uid() = user_id);

drop trigger if exists saved_restaurants_set_updated_at on public.saved_restaurants;
create trigger saved_restaurants_set_updated_at
  before update on public.saved_restaurants
  for each row
  execute function public.set_updated_at();
