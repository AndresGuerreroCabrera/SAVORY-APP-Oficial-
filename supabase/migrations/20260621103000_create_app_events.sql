create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  session_id text not null,
  event_name text not null check (char_length(event_name) between 1 and 80),
  route text,
  entity_type text,
  entity_id text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  platform text,
  user_agent text,
  viewport_width integer,
  viewport_height integer,
  referrer text,
  occurred_at timestamptz not null default now()
);

create index if not exists app_events_occurred_at_idx on public.app_events(occurred_at desc);
create index if not exists app_events_user_id_idx on public.app_events(user_id, occurred_at desc);
create index if not exists app_events_session_id_idx on public.app_events(session_id, occurred_at desc);
create index if not exists app_events_event_name_idx on public.app_events(event_name, occurred_at desc);
create index if not exists app_events_entity_idx on public.app_events(entity_type, entity_id, occurred_at desc);

alter table public.app_events enable row level security;

drop policy if exists "Clients can insert their own analytics events" on public.app_events;
create policy "Clients can insert their own analytics events"
on public.app_events
for insert
with check (user_id is null or user_id = auth.uid());

drop policy if exists "Users cannot read raw analytics events" on public.app_events;
create policy "Users cannot read raw analytics events"
on public.app_events
for select
using (false);
