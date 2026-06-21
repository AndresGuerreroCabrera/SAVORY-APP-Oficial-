drop policy if exists "Public group restaurants are readable for recommendations" on public.group_restaurants;
create policy "Public group restaurants are readable for recommendations"
on public.group_restaurants
for select
using (status = 'visited' and visibility = 'public');
