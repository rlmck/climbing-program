-- Seed the three athlete profiles.
--
-- PREREQUISITE: create the three auth users first (Supabase Dashboard ->
-- Authentication -> Users -> "Add user", with email confirmation on), using
-- the SAME email addresses as below. Then edit the placeholder emails for
-- Jade and Maks to their real ones, and run this file (SQL editor or
-- `supabase db push --include-seed` / psql).
--
-- Bodyweight and program_start_date stay null until each athlete completes
-- onboarding in the app.

insert into public.athletes (user_id, name, is_coach, is_athlete, strength_progression_kg)
select u.id, v.name, v.is_coach, v.is_athlete, 2.0
from (
  values
    ('rosslewismckechnie@gmail.com', 'Ross', true,  true),
    ('jade@example.com',             'Jade', false, true),
    ('maks@example.com',             'Maks', false, true)
) as v(email, name, is_coach, is_athlete)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (user_id) do update
  set name = excluded.name,
      is_coach = excluded.is_coach,
      is_athlete = excluded.is_athlete;

-- Sanity check: should return 3 rows.
select a.name, a.is_coach, a.is_athlete, u.email
from public.athletes a join auth.users u on u.id = a.user_id
order by a.name;
