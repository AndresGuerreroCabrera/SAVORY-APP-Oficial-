create or replace function public.group_has_public_visit(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_restaurants gr
    where gr.group_id = target_group_id
      and gr.status = 'visited'
      and gr.visibility = 'public'
  );
$$;

drop policy if exists "Groups with public visits are readable for feed" on public.groups;
create policy "Groups with public visits are readable for feed"
on public.groups
for select
using (public.group_has_public_visit(groups.id));

drop policy if exists "Public visit group memberships are readable for feed" on public.group_members;
create policy "Public visit group memberships are readable for feed"
on public.group_members
for select
using (public.group_has_public_visit(group_members.group_id));
