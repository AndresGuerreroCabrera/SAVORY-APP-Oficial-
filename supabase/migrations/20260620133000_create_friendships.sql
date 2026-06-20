create extension if not exists pgcrypto with schema extensions;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self_request check (requester_id <> receiver_id),
  constraint friendships_status_check check (status in ('pending', 'accepted'))
);

create unique index if not exists friendships_unique_active_pair
  on public.friendships (least(requester_id, receiver_id), greatest(requester_id, receiver_id))
  where status in ('pending', 'accepted');

alter table public.friendships enable row level security;
alter table public.friendships replica identity full;

drop policy if exists "Friendships are visible to participants" on public.friendships;
create policy "Friendships are visible to participants"
  on public.friendships
  for select
  using (auth.uid() = requester_id or auth.uid() = receiver_id);

drop policy if exists "Users can request friendships" on public.friendships;
create policy "Users can request friendships"
  on public.friendships
  for insert
  with check (
    auth.uid() = requester_id
    and requester_id <> receiver_id
    and status = 'pending'
  );

drop policy if exists "Receivers can accept pending friendships" on public.friendships;
create policy "Receivers can accept pending friendships"
  on public.friendships
  for update
  using (auth.uid() = receiver_id and status = 'pending')
  with check (auth.uid() = receiver_id and status = 'accepted');

drop policy if exists "Participants can remove friendships" on public.friendships;
create policy "Participants can remove friendships"
  on public.friendships
  for delete
  using (auth.uid() = requester_id or auth.uid() = receiver_id);

create or replace function public.prevent_friendship_identity_update()
returns trigger
language plpgsql
as $$
begin
  if old.requester_id <> new.requester_id or old.receiver_id <> new.receiver_id then
    raise exception 'friendship participants cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists friendships_prevent_identity_update on public.friendships;
create trigger friendships_prevent_identity_update
  before update on public.friendships
  for each row
  execute function public.prevent_friendship_identity_update();

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
  before update on public.friendships
  for each row
  execute function public.set_updated_at();

do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception
  when duplicate_object then null;
end;
$$;
