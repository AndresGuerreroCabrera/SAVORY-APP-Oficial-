create index if not exists app_events_route_occurred_at_idx
on public.app_events(route, occurred_at desc);

create index if not exists app_events_user_route_occurred_at_idx
on public.app_events(user_id, route, occurred_at desc);

create index if not exists app_events_metadata_gin_idx
on public.app_events using gin(metadata jsonb_path_ops);
