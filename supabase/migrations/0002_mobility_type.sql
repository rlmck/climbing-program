-- Mobility sessions, part 1: the enum value.
-- Kept separate from the backfill (0003) because Postgres cannot use a new
-- enum value inside the same transaction that adds it.

alter type session_type add value if not exists 'mobility';
