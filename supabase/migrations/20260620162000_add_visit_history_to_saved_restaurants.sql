alter table public.saved_restaurants
  add column if not exists visit_history jsonb not null default '[]'::jsonb;

update public.saved_restaurants
set visit_history = jsonb_build_array(
  jsonb_build_object(
    'cuisine_types', cuisine_types,
    'dish_photos', dish_photos,
    'food_rating', food_rating,
    'general_comment', general_comment,
    'local_photos', local_photos,
    'occasion_types', occasion_types,
    'price_range', price_range,
    'saved_at', saved_at,
    'service_comment', service_comment,
    'visibility', visibility
  )
)
where status = 'visited'
  and visit_history = '[]'::jsonb;
