create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key
);

alter table supabase_migrations.schema_migrations
  add column if not exists name text,
  add column if not exists statements text[];

insert into supabase_migrations.schema_migrations (version, name, statements)
values
  (
    '20260620114500',
    'create_profiles',
    array['Metadata repaired from repository file supabase/migrations/20260620114500_create_profiles.sql']
  ),
  (
    '20260620133000',
    'create_friendships',
    array['Metadata repaired from repository file supabase/migrations/20260620133000_create_friendships.sql']
  ),
  (
    '20260620143000',
    'create_saved_restaurants',
    array['Metadata repaired from repository file supabase/migrations/20260620143000_create_saved_restaurants.sql']
  ),
  (
    '20260620152000',
    'add_profile_avatar_metadata',
    array['Metadata repaired from repository file supabase/migrations/20260620152000_add_profile_avatar_metadata.sql']
  ),
  (
    '20260620162000',
    'add_visit_history_to_saved_restaurants',
    array['Metadata repaired from repository file supabase/migrations/20260620162000_add_visit_history_to_saved_restaurants.sql']
  ),
  (
    '20260620220000',
    'repair_supabase_migrations_metadata',
    array['Creates missing supabase_migrations.schema_migrations metadata table and records local migration history.']
  )
on conflict (version) do update
set
  name = excluded.name,
  statements = excluded.statements;
