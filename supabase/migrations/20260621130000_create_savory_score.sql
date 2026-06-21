create table if not exists public.profile_savory_scores (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  score numeric not null default 0,
  positive_score numeric not null default 0,
  exposure_score numeric not null default 0,
  exposure_count integer not null default 0,
  useful_actions integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  google_place_id text not null,
  restaurant_record_id uuid,
  event_name text not null,
  event_kind text not null check (event_kind in ('positive', 'exposure')),
  event_weight numeric not null check (event_weight >= 0),
  source text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists profile_savory_scores_score_idx
  on public.profile_savory_scores(score desc, updated_at desc);

create index if not exists restaurant_events_owner_idx
  on public.restaurant_events(owner_user_id, occurred_at desc);

create index if not exists restaurant_events_actor_place_idx
  on public.restaurant_events(actor_user_id, google_place_id, event_kind);

alter table public.profile_savory_scores enable row level security;
alter table public.restaurant_events enable row level security;

drop policy if exists "Savory scores are publicly readable" on public.profile_savory_scores;
create policy "Savory scores are publicly readable"
on public.profile_savory_scores
for select
using (true);

drop policy if exists "Users cannot write savory scores" on public.profile_savory_scores;
create policy "Users cannot write savory scores"
on public.profile_savory_scores
for all
using (false)
with check (false);

drop policy if exists "Users cannot read raw restaurant score events" on public.restaurant_events;
create policy "Users cannot read raw restaurant score events"
on public.restaurant_events
for select
using (false);

create or replace function public.get_restaurant_event_weight(event_name text)
returns table(event_kind text, event_weight numeric)
language sql
immutable
as $$
  select weights.kind, weights.weight
  from (
    values
      ('swipe_right', 'positive', 1.0::numeric),
      ('save_from_feed', 'positive', 1.5::numeric),
      ('save_from_profile', 'positive', 2.0::numeric),
      ('save_generic', 'positive', 1.0::numeric),
      ('add_to_shared_list', 'positive', 2.5::numeric),
      ('mark_visited', 'positive', 4.0::numeric),
      ('recommendation_impression', 'exposure', 1.0::numeric),
      ('feed_impression', 'exposure', 0.7::numeric),
      ('profile_view', 'exposure', 0.5::numeric)
  ) as weights(name, kind, weight)
  where weights.name = event_name;
$$;

create or replace function public.recompute_profile_savory_score(target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  positive_points numeric := 0;
  exposure_points numeric := 0;
  exposure_rows integer := 0;
  useful_rows integer := 0;
  confidence_factor numeric := 0;
  next_score numeric := 0;
begin
  select
    coalesce(sum(strongest_weight), 0),
    count(*)
  into positive_points, useful_rows
  from (
    select
      google_place_id,
      actor_user_id,
      max(event_weight) as strongest_weight
    from public.restaurant_events
    where owner_user_id = target_profile_id
      and event_kind = 'positive'
      and actor_user_id is not null
    group by google_place_id, actor_user_id
  ) strongest_actions;

  select
    coalesce(sum(event_weight), 0),
    count(*)
  into exposure_points, exposure_rows
  from public.restaurant_events
  where owner_user_id = target_profile_id
    and event_kind = 'exposure';

  if exposure_points > 0 then
    confidence_factor := least(1, exposure_points / 100);
    next_score := round(100 * (positive_points / exposure_points) * confidence_factor);
  else
    next_score := 0;
  end if;

  insert into public.profile_savory_scores (
    profile_id,
    score,
    positive_score,
    exposure_score,
    exposure_count,
    useful_actions,
    updated_at
  )
  values (
    target_profile_id,
    next_score,
    positive_points,
    exposure_points,
    exposure_rows,
    useful_rows,
    now()
  )
  on conflict (profile_id) do update
  set
    score = excluded.score,
    positive_score = excluded.positive_score,
    exposure_score = excluded.exposure_score,
    exposure_count = excluded.exposure_count,
    useful_actions = excluded.useful_actions,
    updated_at = now();
end;
$$;

create or replace function public.handle_restaurant_event_score_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_profile_savory_score(new.owner_user_id);
  return new;
end;
$$;

drop trigger if exists restaurant_events_recompute_savory_score on public.restaurant_events;
create trigger restaurant_events_recompute_savory_score
after insert on public.restaurant_events
for each row execute function public.handle_restaurant_event_score_recompute();

create or replace function public.record_restaurant_event(
  p_owner_user_id uuid,
  p_google_place_id text,
  p_event_name text,
  p_restaurant_record_id uuid default null,
  p_source text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_actor uuid := auth.uid();
  resolved_kind text;
  resolved_weight numeric;
begin
  if current_actor is null then
    return jsonb_build_object('status', 'skipped-anonymous');
  end if;

  if p_owner_user_id is null or p_google_place_id is null or length(trim(p_google_place_id)) = 0 then
    return jsonb_build_object('status', 'skipped-invalid');
  end if;

  if current_actor = p_owner_user_id then
    return jsonb_build_object('status', 'skipped-self');
  end if;

  select event_kind, event_weight
  into resolved_kind, resolved_weight
  from public.get_restaurant_event_weight(p_event_name)
  limit 1;

  if resolved_kind is null then
    return jsonb_build_object('status', 'skipped-unknown-event');
  end if;

  insert into public.restaurant_events (
    owner_user_id,
    actor_user_id,
    google_place_id,
    restaurant_record_id,
    event_name,
    event_kind,
    event_weight,
    source,
    metadata
  )
  values (
    p_owner_user_id,
    current_actor,
    p_google_place_id,
    p_restaurant_record_id,
    p_event_name,
    resolved_kind,
    resolved_weight,
    p_source,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object('status', 'recorded');
end;
$$;

insert into public.profile_savory_scores (profile_id)
select id
from public.profiles
on conflict do nothing;

create or replace function public.handle_new_profile_savory_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
beginme ha
  insert into public.profile_savory_scores (profile_id)
  values (new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_create_savory_score on public.profiles;
create trigger profiles_create_savory_score
after insert on public.profiles
for each row execute function public.handle_new_profile_savory_score();
