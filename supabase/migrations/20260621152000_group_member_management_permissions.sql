drop policy if exists "Owners can update groups" on public.groups;
drop policy if exists "Group members can update groups" on public.groups;

create policy "Group members can update groups"
on public.groups
for update
using (
  public.is_group_member(groups.id, auth.uid())
)
with check (
  public.is_group_member(groups.id, auth.uid())
);

drop policy if exists "Owners can add group members" on public.group_members;
drop policy if exists "Group members can add friends to groups" on public.group_members;

create policy "Group members can add friends to groups"
on public.group_members
for insert
with check (
  (
    exists (
      select 1
      from public.groups g
      where g.id = group_members.group_id
        and g.owner_id = auth.uid()
    )
    and (
      (
        group_members.user_id = auth.uid()
        and group_members.role = 'owner'
      )
      or (
        group_members.role = 'member'
        and exists (
          select 1
          from public.friendships f
          where f.status = 'accepted'
            and (
              (
                f.requester_id = auth.uid()
                and f.receiver_id = group_members.user_id
              )
              or (
                f.receiver_id = auth.uid()
                and f.requester_id = group_members.user_id
              )
            )
        )
      )
    )
  )
  or (
    public.is_group_member(group_members.group_id, auth.uid())
    and group_members.role = 'member'
    and exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (
            f.requester_id = auth.uid()
            and f.receiver_id = group_members.user_id
          )
          or (
            f.receiver_id = auth.uid()
            and f.requester_id = group_members.user_id
          )
        )
    )
  )
);