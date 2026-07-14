-- Climbing Program v1 — schema, constraints, RLS, storage.
-- Apply with: supabase db push   (or paste into the SQL editor in order)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type grip_type as enum ('half_crimp', 'three_finger_drag');
create type hand_type as enum ('left', 'right');
create type benchmark_type as enum ('mvc', 'cft');
create type session_type as enum ('strength', 'aerobic', 'power_endurance', 'easy_climbing');
create type session_status as enum ('unplaced', 'planned', 'complete', 'failed');
create type aerobic_variable as enum ('grade', 'length', 'tut');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  bodyweight_kg numeric(5, 2),
  is_coach boolean not null default false,
  is_athlete boolean not null default true,
  program_start_date date, -- normalised to a Monday when the program is generated
  strength_progression_kg numeric(4, 2) not null default 2.0,
  created_at timestamptz not null default now()
);

create table public.benchmarks (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  test_round smallint not null check (test_round in (1, 2)),
  type benchmark_type not null,
  grip grip_type not null,
  hand hand_type, -- null for MVC (two-handed hang), required for CFT
  mvc_total_load_kg numeric(6, 3), -- unrounded; UI rounds to 0.5 kg for display
  critical_force numeric(6, 3),
  cf_ratio numeric(5, 4),
  cf_min numeric(6, 3),
  threshold_zone text,
  arc_zone text,
  raw_file_path text, -- Storage path of the untouched uploaded file (CFT only)
  raw_json jsonb,     -- parsed CFT with rep-level series; rawReadings stripped (kept in Storage)
  bodyweight_kg numeric(5, 2), -- bodyweight as recorded at this test
  tested_at timestamptz not null default now(),
  constraint benchmarks_shape check (
    (type = 'mvc' and hand is null and mvc_total_load_kg is not null)
    or (type = 'cft' and hand is not null and critical_force is not null)
  ),
  -- one row per slot per round (re-upload replaces via upsert)
  constraint benchmarks_slot_unique unique nulls not distinct (athlete_id, test_round, type, grip, hand)
);

create table public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 13),
  phase text not null,
  strength_count smallint not null default 0,
  aerobic_count smallint not null default 0,
  power_endurance_count smallint not null default 0,
  constraint program_weeks_unique unique (athlete_id, week_number)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 13),
  type session_type not null,
  is_extra boolean not null default false,
  scheduled_date date, -- null until dragged onto a day
  status session_status not null default 'unplaced',
  grip_failures jsonb, -- {"half_crimp": {"failed": true, "sets": [3,4]}, "three_finger_drag": {"failed": false}}
  notes text,
  created_at timestamptz not null default now(),
  -- unplaced <=> no date; logging requires a placed session
  constraint sessions_placement check (
    (scheduled_date is null and status = 'unplaced')
    or (scheduled_date is not null and status <> 'unplaced')
  ),
  constraint sessions_grip_failures_strength_only check (grip_failures is null or type = 'strength')
);

create table public.strength_loads (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  fortnight smallint not null check (fortnight between 1 and 5), -- strength exists weeks 1-10 only
  grip grip_type not null,
  load_kg numeric(6, 3) not null,        -- total load (bw + added), unrounded
  added_weight_kg numeric(6, 3),         -- load - bodyweight at time of computation (may be negative = assisted)
  progressed boolean not null,           -- false for fortnight 1 baseline
  hold_reason text,                      -- why the load did not move (null when progressed or baseline)
  created_at timestamptz not null default now(),
  constraint strength_loads_unique unique (athlete_id, fortnight, grip)
);

create table public.aerobic_progressions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  fortnight smallint not null check (fortnight between 1 and 6), -- aerobic exists weeks 1-12
  grade text not null,
  route_length text not null,
  tut_seconds integer not null check (tut_seconds > 0),
  variable_bumped aerobic_variable, -- null only for the fortnight-1 baseline
  created_at timestamptz not null default now(),
  constraint aerobic_baseline_shape check ((fortnight = 1) = (variable_bumped is null)),
  constraint aerobic_progressions_unique unique (athlete_id, fortnight)
);

create index sessions_athlete_date_idx on public.sessions (athlete_id, scheduled_date);
create index sessions_athlete_week_idx on public.sessions (athlete_id, week_number);
create index benchmarks_athlete_idx on public.benchmarks (athlete_id, test_round);

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies don't recurse into athletes RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_coach()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select a.is_coach from public.athletes a where a.user_id = auth.uid()), false);
$$;

create or replace function public.own_athlete_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select a.id from public.athletes a where a.user_id = auth.uid();
$$;

revoke execute on function public.is_coach() from anon;
revoke execute on function public.own_athlete_id() from anon;

-- Athletes must not be able to promote themselves or reassign their row.
create or replace function public.athletes_guard_flags()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for service-role/dashboard access, which stays unrestricted
  if auth.uid() is not null and (
    new.is_coach is distinct from old.is_coach
    or new.is_athlete is distinct from old.is_athlete
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'role flags and user_id can only be changed by the service role';
  end if;
  return new;
end;
$$;

create trigger athletes_guard_flags
  before update on public.athletes
  for each row execute function public.athletes_guard_flags();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Athletes: read/write own rows only. Coach: read everything, write nothing
-- extra (coach is read-only in v1).
-- ---------------------------------------------------------------------------
alter table public.athletes enable row level security;
alter table public.benchmarks enable row level security;
alter table public.program_weeks enable row level security;
alter table public.sessions enable row level security;
alter table public.strength_loads enable row level security;
alter table public.aerobic_progressions enable row level security;

create policy athletes_select on public.athletes
  for select using (user_id = auth.uid() or public.is_coach());
create policy athletes_update_own on public.athletes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- no insert/delete policies: athlete rows are seeded via SQL (service role)

create policy benchmarks_select on public.benchmarks
  for select using (athlete_id = public.own_athlete_id() or public.is_coach());
create policy benchmarks_insert_own on public.benchmarks
  for insert with check (athlete_id = public.own_athlete_id());
create policy benchmarks_update_own on public.benchmarks
  for update using (athlete_id = public.own_athlete_id())
  with check (athlete_id = public.own_athlete_id());
create policy benchmarks_delete_own on public.benchmarks
  for delete using (athlete_id = public.own_athlete_id());

create policy program_weeks_select on public.program_weeks
  for select using (athlete_id = public.own_athlete_id() or public.is_coach());
create policy program_weeks_insert_own on public.program_weeks
  for insert with check (athlete_id = public.own_athlete_id());

create policy sessions_select on public.sessions
  for select using (athlete_id = public.own_athlete_id() or public.is_coach());
create policy sessions_insert_own on public.sessions
  for insert with check (athlete_id = public.own_athlete_id());
create policy sessions_update_own on public.sessions
  for update using (athlete_id = public.own_athlete_id())
  with check (athlete_id = public.own_athlete_id());
create policy sessions_delete_own on public.sessions
  for delete using (athlete_id = public.own_athlete_id());

create policy strength_loads_select on public.strength_loads
  for select using (athlete_id = public.own_athlete_id() or public.is_coach());
create policy strength_loads_insert_own on public.strength_loads
  for insert with check (athlete_id = public.own_athlete_id());
create policy strength_loads_update_own on public.strength_loads
  for update using (athlete_id = public.own_athlete_id())
  with check (athlete_id = public.own_athlete_id());

create policy aerobic_select on public.aerobic_progressions
  for select using (athlete_id = public.own_athlete_id() or public.is_coach());
create policy aerobic_insert_own on public.aerobic_progressions
  for insert with check (athlete_id = public.own_athlete_id());

-- ---------------------------------------------------------------------------
-- Storage: raw CFT files live in a private bucket, one folder per auth user:
--   cft-files/<auth_user_id>/round<n>/<grip>_<hand>.json
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cft-files', 'cft-files', false)
on conflict (id) do nothing;

create policy cft_files_own_rw on storage.objects
  for all
  using (bucket_id = 'cft-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cft-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy cft_files_coach_read on storage.objects
  for select
  using (bucket_id = 'cft-files' and public.is_coach());
