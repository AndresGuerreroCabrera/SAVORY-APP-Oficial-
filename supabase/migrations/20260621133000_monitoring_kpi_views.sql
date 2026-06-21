create table if not exists public.app_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  session_id text,
  survey_name text not null,
  question_key text not null,
  numeric_value integer,
  text_value text,
  choice_value text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  submitted_at timestamptz not null default now()
);

create index if not exists app_feedback_responses_submitted_at_idx
on public.app_feedback_responses(submitted_at desc);

create index if not exists app_feedback_responses_user_id_idx
on public.app_feedback_responses(user_id, submitted_at desc);

alter table public.app_feedback_responses enable row level security;

drop policy if exists "Users can submit their own feedback" on public.app_feedback_responses;
create policy "Users can submit their own feedback"
on public.app_feedback_responses
for insert
with check (user_id is null or user_id = auth.uid());

drop policy if exists "Users cannot read raw feedback responses" on public.app_feedback_responses;
create policy "Users cannot read raw feedback responses"
on public.app_feedback_responses
for select
using (false);

create or replace view public.analytics_kpi_daily as
with first_seen as (
  select user_id, min(occurred_at)::date as first_seen_date
  from public.app_events
  where user_id is not null
  group by user_id
)
select
  e.occurred_at::date as event_date,
  count(distinct e.user_id) filter (where e.user_id is not null) as active_users,
  count(distinct e.session_id) as sessions,
  count(*) filter (where e.event_name in ('app_opened', 'session_started', 'app_session_start')) as app_opens,
  count(distinct e.user_id) filter (where fs.first_seen_date = e.occurred_at::date) as new_users,
  count(*) filter (where e.event_name = 'user_signed_up') as signups,
  count(*) filter (where e.event_name = 'restaurant_searched') as searches,
  count(*) filter (where e.event_name in ('restaurant_saved', 'restaurant_marked_want_to_go', 'restaurant_marked_visited')) as restaurant_saves,
  count(*) filter (where e.event_name = 'restaurant_marked_want_to_go') as want_to_go_saves,
  count(*) filter (where e.event_name = 'restaurant_marked_visited') as visited_saves,
  count(*) filter (where e.event_name = 'restaurant_saved_from_friend') as saves_from_friends,
  count(*) filter (where e.event_name = 'recommendation_impression') as recommendation_impressions,
  count(*) filter (where e.event_name = 'recommendation_clicked') as recommendation_clicks,
  count(*) filter (where e.event_name = 'recommendation_saved') as recommendation_saves,
  count(*) filter (where e.event_name = 'friend_invited') as friend_invites,
  count(*) filter (where e.event_name = 'friend_added') as friends_added,
  count(*) filter (where e.event_name in ('group_created', 'list_created')) as shared_lists_created,
  count(*) filter (where e.event_name = 'profile_viewed') as profile_views,
  count(*) filter (where e.event_name = 'restaurant_photo_added') as photo_events,
  count(*) filter (where e.event_name = 'restaurant_review_added') as review_events,
  count(*) filter (where e.route = '/') as map_events,
  count(*) filter (where e.route in ('/list', '/wishlist', '/groups') or e.route like '/group/%') as list_events
from public.app_events e
left join first_seen fs on fs.user_id = e.user_id
group by e.occurred_at::date
order by event_date desc;

create or replace view public.analytics_user_activation as
with first_events as (
  select
    user_id,
    min(occurred_at) as first_seen_at,
    (array_agg(session_id order by occurred_at))[1] as first_session_id
  from public.app_events
  where user_id is not null
  group by user_id
),
first_values as (
  select
    fe.user_id,
    min(e.occurred_at) filter (
      where e.event_name in (
        'restaurant_marked_want_to_go',
        'restaurant_marked_visited',
        'restaurant_saved',
        'restaurant_searched',
        'list_created',
        'friend_added',
        'friend_invited'
      )
    ) as first_value_at,
    min(e.occurred_at) filter (
      where e.event_name in ('restaurant_marked_want_to_go', 'restaurant_marked_visited', 'restaurant_saved')
    ) as first_restaurant_saved_at,
    count(*) filter (
      where e.occurred_at < fe.first_seen_at + interval '1 day'
        and e.event_name in (
          'restaurant_searched',
          'restaurant_viewed',
          'restaurant_marked_want_to_go',
          'restaurant_marked_visited',
          'restaurant_saved',
          'list_created',
          'friend_added',
          'friend_invited',
          'recommendation_clicked',
          'recommendation_saved'
        )
    ) as relevant_actions_day_1,
    bool_or(
      e.session_id = fe.first_session_id
      and e.event_name in ('restaurant_marked_want_to_go', 'restaurant_marked_visited', 'restaurant_saved')
    ) as saved_restaurant_first_session
  from first_events fe
  left join public.app_events e on e.user_id = fe.user_id
  group by fe.user_id, fe.first_seen_at, fe.first_session_id
)
select
  fe.user_id,
  fe.first_seen_at,
  fe.first_session_id,
  fv.first_value_at,
  fv.first_restaurant_saved_at,
  extract(epoch from (fv.first_value_at - fe.first_seen_at))::integer as seconds_to_first_value,
  extract(epoch from (fv.first_restaurant_saved_at - fe.first_seen_at))::integer as seconds_to_first_restaurant_saved,
  coalesce(fv.saved_restaurant_first_session, false) as saved_restaurant_first_session,
  coalesce(fv.relevant_actions_day_1, 0) as relevant_actions_day_1,
  coalesce(fv.relevant_actions_day_1, 0) >= 3 as completed_3_relevant_actions_day_1
from first_events fe
left join first_values fv on fv.user_id = fe.user_id;

create or replace view public.analytics_retention_cohorts as
with user_days as (
  select distinct user_id, occurred_at::date as active_date
  from public.app_events
  where user_id is not null
),
cohorts as (
  select user_id, min(active_date) as cohort_date
  from user_days
  group by user_id
)
select
  c.cohort_date,
  count(*) as cohort_users,
  count(*) filter (where d1.user_id is not null) as retained_d1_users,
  count(*) filter (where d7.user_id is not null) as retained_d7_users,
  count(*) filter (where d30.user_id is not null) as retained_d30_users,
  round(100.0 * count(*) filter (where d1.user_id is not null) / nullif(count(*), 0), 2) as d1_retention_pct,
  round(100.0 * count(*) filter (where d7.user_id is not null) / nullif(count(*), 0), 2) as d7_retention_pct,
  round(100.0 * count(*) filter (where d30.user_id is not null) / nullif(count(*), 0), 2) as d30_retention_pct
from cohorts c
left join user_days d1 on d1.user_id = c.user_id and d1.active_date = c.cohort_date + 1
left join user_days d7 on d7.user_id = c.user_id and d7.active_date between c.cohort_date + 7 and c.cohort_date + 13
left join user_days d30 on d30.user_id = c.user_id and d30.active_date between c.cohort_date + 30 and c.cohort_date + 36
group by c.cohort_date
order by c.cohort_date desc;

create or replace view public.analytics_user_engagement as
select
  e.user_id,
  min(e.occurred_at) as first_seen_at,
  max(e.occurred_at) as last_seen_at,
  count(distinct e.occurred_at::date) as active_days,
  count(distinct e.session_id) as sessions,
  count(*) filter (where e.event_name = 'restaurant_searched') as searches,
  count(*) filter (where e.event_name in ('restaurant_marked_want_to_go', 'restaurant_marked_visited', 'restaurant_saved')) as restaurants_saved,
  count(*) filter (where e.event_name = 'restaurant_marked_want_to_go') as want_to_go_count,
  count(*) filter (where e.event_name = 'restaurant_marked_visited') as visited_count,
  count(*) filter (where e.event_name = 'restaurant_photo_added') as photo_events,
  count(*) filter (where e.event_name = 'restaurant_review_added') as review_events,
  count(*) filter (where e.event_name = 'restaurant_rating_added') as rating_events,
  count(*) filter (where e.event_name = 'saved_restaurant_detail_opened') as saved_restaurant_consults,
  avg(
    case
      when e.metadata ->> 'time_since_saved_hours' ~ '^[0-9]+(\.[0-9]+)?$'
      then (e.metadata ->> 'time_since_saved_hours')::numeric
      else null
    end
  ) filter (where e.event_name = 'saved_restaurant_detail_opened') as avg_hours_between_save_and_consult,
  count(*) filter (where e.event_name = 'friend_added') as friends_added,
  count(*) filter (where e.event_name = 'friend_invited') as friend_invites,
  count(*) filter (where e.event_name in ('group_created', 'list_created')) as shared_lists_created,
  count(*) filter (where e.route = '/') as map_events,
  count(*) filter (where e.route in ('/list', '/wishlist', '/groups') or e.route like '/group/%') as list_events
from public.app_events e
where e.user_id is not null
group by e.user_id;

create or replace view public.analytics_discovery_funnel_daily as
select
  occurred_at::date as event_date,
  count(*) filter (where event_name = 'recommendation_impression') as recommendation_impressions,
  count(*) filter (where event_name = 'recommendation_clicked') as recommendation_clicks,
  count(*) filter (where event_name = 'recommendation_saved') as recommendation_saves,
  round(100.0 * count(*) filter (where event_name = 'recommendation_clicked') / nullif(count(*) filter (where event_name = 'recommendation_impression'), 0), 2) as recommendation_ctr_pct,
  round(100.0 * count(*) filter (where event_name = 'recommendation_saved') / nullif(count(*) filter (where event_name = 'recommendation_impression'), 0), 2) as recommendation_save_rate_pct,
  count(*) filter (where event_name = 'restaurant_saved_from_friend') as saves_from_friends,
  count(*) filter (where event_name = 'save_from_profile') as saves_from_profiles,
  count(*) filter (where event_name = 'restaurant_searched') as searches,
  count(*) filter (where event_name in ('restaurant_marked_want_to_go', 'restaurant_marked_visited', 'restaurant_saved')) as total_saves,
  round(100.0 * count(*) filter (where event_name in ('restaurant_marked_want_to_go', 'restaurant_marked_visited', 'restaurant_saved')) / nullif(count(*) filter (where event_name = 'restaurant_searched'), 0), 2) as search_to_save_rate_pct
from public.app_events
group by occurred_at::date
order by event_date desc;

create or replace view public.analytics_social_daily as
select
  occurred_at::date as event_date,
  count(*) filter (where event_name = 'friend_invited') as friend_invites,
  count(*) filter (where event_name = 'friend_added') as friends_added,
  round(100.0 * count(*) filter (where event_name = 'friend_added') / nullif(count(*) filter (where event_name = 'friend_invited'), 0), 2) as friend_invite_to_add_rate_pct,
  count(*) filter (where event_name = 'list_created') as lists_created,
  count(*) filter (where event_name = 'list_shared') as lists_shared,
  count(*) filter (where event_name = 'restaurant_saved_from_friend') as restaurants_saved_from_friends
from public.app_events
group by occurred_at::date
order by event_date desc;

create or replace view public.analytics_content_quality as
with restaurant_rows as (
  select
    user_id,
    google_place_id,
    status,
    visibility,
    cuisine_types,
    dish_photos,
    food_rating,
    occasion_types,
    local_photos,
    price_range,
    service_comment,
    general_comment,
    location_lat,
    location_lng,
    saved_at
  from public.saved_restaurants
  union all
  select
    added_by as user_id,
    google_place_id,
    status,
    visibility,
    cuisine_types,
    dish_photos,
    food_rating,
    occasion_types,
    local_photos,
    price_range,
    service_comment,
    general_comment,
    location_lat,
    location_lng,
    saved_at
  from public.group_restaurants
),
scored as (
  select
    *,
    (
      (case when array_length(cuisine_types, 1) > 0 then 1 else 0 end) +
      (case when array_length(occasion_types, 1) > 0 then 1 else 0 end) +
      (case when price_range is not null then 1 else 0 end) +
      (case when food_rating > 0 then 1 else 0 end) +
      (case when nullif(general_comment, '') is not null or nullif(service_comment, '') is not null then 1 else 0 end) +
      (case when jsonb_array_length(dish_photos) > 0 or jsonb_array_length(local_photos) > 0 then 1 else 0 end)
    ) as completed_fields
  from restaurant_rows
)
select
  count(*) as saved_restaurant_rows,
  count(distinct google_place_id) as unique_restaurants,
  count(*) filter (where visibility = 'public') as public_restaurant_rows,
  count(*) filter (where status = 'want_to_go') as want_to_go_rows,
  count(*) filter (where status = 'visited') as visited_rows,
  round(avg(completed_fields), 2) as avg_completed_fields,
  round(100.0 * count(*) filter (where completed_fields >= 4) / nullif(count(*), 0), 2) as pct_restaurants_with_rich_info,
  round(100.0 * count(*) filter (where food_rating > 0) / nullif(count(*), 0), 2) as pct_with_rating,
  round(100.0 * count(*) filter (where nullif(general_comment, '') is not null or nullif(service_comment, '') is not null) / nullif(count(*), 0), 2) as pct_with_comment,
  round(100.0 * count(*) filter (where jsonb_array_length(dish_photos) > 0 or jsonb_array_length(local_photos) > 0) / nullif(count(*), 0), 2) as pct_with_photo,
  round(100.0 * count(distinct google_place_id) filter (
    where google_place_id in (
      select google_place_id
      from scored
      group by google_place_id
      having count(distinct user_id) > 1
    )
  ) / nullif(count(distinct google_place_id), 0), 2) as pct_unique_restaurants_saved_by_multiple_users
from scored;

create or replace view public.analytics_feedback_summary as
select
  survey_name,
  question_key,
  count(*) as responses,
  round(avg(numeric_value) filter (where numeric_value is not null), 2) as avg_numeric_value,
  count(*) filter (where choice_value = 'muy_decepcionado') as very_disappointed_count,
  round(100.0 * count(*) filter (where choice_value = 'muy_decepcionado') / nullif(count(*), 0), 2) as very_disappointed_pct
from public.app_feedback_responses
group by survey_name, question_key;

create or replace view public.analytics_active_user_rollups as
with bounds as (
  select
    min(occurred_at)::date as first_date,
    max(occurred_at)::date as last_date
  from public.app_events
),
days as (
  select generate_series(
    coalesce((select first_date from bounds), current_date),
    coalesce((select last_date from bounds), current_date),
    interval '1 day'
  )::date as metric_date
),
user_days as (
  select distinct user_id, occurred_at::date as active_date
  from public.app_events
  where user_id is not null
)
select
  d.metric_date,
  count(distinct ud_d.user_id) as dau,
  count(distinct ud_w.user_id) as wau,
  count(distinct ud_m.user_id) as mau,
  round(count(distinct ud_d.user_id)::numeric / nullif(count(distinct ud_m.user_id), 0), 4) as dau_mau_stickiness,
  round(count(distinct ud_w.user_id)::numeric / nullif(count(distinct ud_m.user_id), 0), 4) as wau_mau_stickiness
from days d
left join user_days ud_d on ud_d.active_date = d.metric_date
left join user_days ud_w on ud_w.active_date between d.metric_date - 6 and d.metric_date
left join user_days ud_m on ud_m.active_date between d.metric_date - 29 and d.metric_date
group by d.metric_date
order by d.metric_date desc;

create or replace view public.analytics_retention_by_activation_signal as
with user_days as (
  select distinct user_id, occurred_at::date as active_date
  from public.app_events
  where user_id is not null
),
first_seen as (
  select user_id, min(occurred_at) as first_seen_at, min(occurred_at)::date as cohort_date
  from public.app_events
  where user_id is not null
  group by user_id
),
signals as (
  select
    fs.user_id,
    fs.cohort_date,
    bool_or(e.event_name in ('restaurant_marked_want_to_go', 'restaurant_marked_visited', 'restaurant_saved')) as saved_1_restaurant_day_3,
    count(*) filter (where e.event_name in ('restaurant_marked_want_to_go', 'restaurant_marked_visited', 'restaurant_saved')) >= 3 as saved_3_restaurants_day_3,
    bool_or(e.event_name in ('group_created', 'list_created')) as created_list_day_3,
    bool_or(e.event_name in ('friend_added', 'friend_invited')) as social_action_day_3,
    bool_or(e.event_name = 'restaurant_photo_added') as uploaded_photo_day_3,
    bool_or(e.route = '/') as used_map_day_3,
    bool_or(e.event_name in ('recommendation_clicked', 'recommendation_saved')) as used_recommendations_day_3
  from first_seen fs
  left join public.app_events e
    on e.user_id = fs.user_id
   and e.occurred_at < fs.first_seen_at + interval '3 days'
  group by fs.user_id, fs.cohort_date
),
signal_rows as (
  select user_id, cohort_date, 'saved_1_restaurant_day_3' as signal, saved_1_restaurant_day_3 as has_signal from signals
  union all
  select user_id, cohort_date, 'saved_3_restaurants_day_3', saved_3_restaurants_day_3 from signals
  union all
  select user_id, cohort_date, 'created_list_day_3', created_list_day_3 from signals
  union all
  select user_id, cohort_date, 'social_action_day_3', social_action_day_3 from signals
  union all
  select user_id, cohort_date, 'uploaded_photo_day_3', uploaded_photo_day_3 from signals
  union all
  select user_id, cohort_date, 'used_map_day_3', used_map_day_3 from signals
  union all
  select user_id, cohort_date, 'used_recommendations_day_3', used_recommendations_day_3 from signals
)
select
  sr.signal,
  sr.has_signal,
  count(*) as users,
  count(*) filter (where d7.user_id is not null) as retained_d7_users,
  count(*) filter (where d30.user_id is not null) as retained_d30_users,
  round(100.0 * count(*) filter (where d7.user_id is not null) / nullif(count(*), 0), 2) as d7_retention_pct,
  round(100.0 * count(*) filter (where d30.user_id is not null) / nullif(count(*), 0), 2) as d30_retention_pct
from signal_rows sr
left join user_days d7
  on d7.user_id = sr.user_id
 and d7.active_date between sr.cohort_date + 7 and sr.cohort_date + 13
left join user_days d30
  on d30.user_id = sr.user_id
 and d30.active_date between sr.cohort_date + 30 and sr.cohort_date + 36
group by sr.signal, sr.has_signal
order by sr.signal, sr.has_signal desc;

revoke all on public.analytics_kpi_daily from anon, authenticated;
revoke all on public.analytics_user_activation from anon, authenticated;
revoke all on public.analytics_retention_cohorts from anon, authenticated;
revoke all on public.analytics_user_engagement from anon, authenticated;
revoke all on public.analytics_discovery_funnel_daily from anon, authenticated;
revoke all on public.analytics_social_daily from anon, authenticated;
revoke all on public.analytics_content_quality from anon, authenticated;
revoke all on public.analytics_feedback_summary from anon, authenticated;
revoke all on public.analytics_active_user_rollups from anon, authenticated;
revoke all on public.analytics_retention_by_activation_signal from anon, authenticated;
