import type {
  AerobicVariable,
  Grip,
  GripFailures,
  Hand,
  SessionStatus,
  SessionType,
} from '../domain/types';

// Row shapes as returned by PostgREST. Numeric columns arrive as JSON numbers.

export interface AthleteRow {
  id: string;
  user_id: string;
  name: string;
  bodyweight_kg: number | null;
  is_coach: boolean;
  is_athlete: boolean;
  program_start_date: string | null; // Monday, YYYY-MM-DD
  strength_progression_kg: number;
}

export interface BenchmarkRow {
  id: string;
  athlete_id: string;
  test_round: 1 | 2;
  type: 'mvc' | 'cft';
  grip: Grip;
  hand: Hand | null;
  mvc_total_load_kg: number | null;
  critical_force: number | null;
  cf_ratio: number | null;
  cf_min: number | null;
  threshold_zone: string | null;
  arc_zone: string | null;
  raw_file_path: string | null;
  raw_json: unknown;
  bodyweight_kg: number | null;
  tested_at: string;
}

export interface ProgramWeekRow {
  id: string;
  athlete_id: string;
  week_number: number;
  phase: string;
  strength_count: number;
  aerobic_count: number;
  power_endurance_count: number;
}

export interface SessionRow {
  id: string;
  athlete_id: string;
  week_number: number;
  type: SessionType;
  is_extra: boolean;
  scheduled_date: string | null;
  status: SessionStatus;
  grip_failures: GripFailures | null;
  notes: string | null;
}

export interface StrengthLoadRow {
  id: string;
  athlete_id: string;
  fortnight: number;
  grip: Grip;
  load_kg: number;
  added_weight_kg: number | null;
  progressed: boolean;
  hold_reason: string | null;
}

export interface AerobicProgressionRow {
  id: string;
  athlete_id: string;
  fortnight: number;
  grade: string;
  route_length: string;
  tut_seconds: number;
  variable_bumped: AerobicVariable | null;
}
