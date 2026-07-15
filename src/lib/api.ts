import { supabase } from './supabase';
import type {
  AerobicProgressionRow,
  AthleteRow,
  BenchmarkRow,
  ProgramWeekRow,
  SessionRow,
  StrengthLoadRow,
} from './db';
import type { CftSummary } from '../domain/cft';
import type { Grip, GripFailures, Hand, SessionType } from '../domain/types';
import { GRIPS } from '../domain/types';
import { generateProgram, fortnightOfWeek, LAST_STRENGTH_FORTNIGHT } from '../domain/program';
import { computeLoadHistory, type StrengthSessionLog } from '../domain/progression';
import { trainingLoadFromMvc } from '../domain/loads';
import { addDays, mondayOfWeek, todayISO, weekNumberFor, type ISODate } from '../domain/dates';

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Athletes
// ---------------------------------------------------------------------------

export async function getOwnAthlete(userId: string): Promise<AthleteRow | null> {
  const { data, error } = await supabase.from('athletes').select('*').eq('user_id', userId).maybeSingle();
  throwIf(error);
  return data as AthleteRow | null;
}

export async function listAthletes(): Promise<AthleteRow[]> {
  const { data, error } = await supabase.from('athletes').select('*').order('name');
  throwIf(error);
  return (data ?? []) as AthleteRow[];
}

export async function getAthlete(athleteId: string): Promise<AthleteRow> {
  const { data, error } = await supabase.from('athletes').select('*').eq('id', athleteId).single();
  throwIf(error);
  return data as AthleteRow;
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

export async function getBenchmarks(athleteId: string): Promise<BenchmarkRow[]> {
  const { data, error } = await supabase.from('benchmarks').select('*').eq('athlete_id', athleteId);
  throwIf(error);
  return (data ?? []) as BenchmarkRow[];
}

export async function upsertMvcBenchmark(
  athleteId: string,
  testRound: 1 | 2,
  grip: Grip,
  mvcTotalLoadKg: number,
  bodyweightKg: number,
): Promise<void> {
  const { error } = await supabase.from('benchmarks').upsert(
    {
      athlete_id: athleteId,
      test_round: testRound,
      type: 'mvc',
      grip,
      hand: null,
      mvc_total_load_kg: mvcTotalLoadKg,
      bodyweight_kg: bodyweightKg,
      tested_at: new Date().toISOString(),
    },
    { onConflict: 'athlete_id,test_round,type,grip,hand' },
  );
  throwIf(error);
}

export async function uploadCftFile(
  userId: string,
  testRound: 1 | 2,
  grip: Grip,
  hand: Hand,
  fileText: string,
): Promise<string> {
  const path = `${userId}/round${testRound}/${grip}_${hand}.json`;
  const { error } = await supabase.storage
    .from('cft-files')
    .upload(path, new Blob([fileText], { type: 'application/json' }), { upsert: true });
  throwIf(error);
  return path;
}

export async function upsertCftBenchmark(
  athleteId: string,
  testRound: 1 | 2,
  grip: Grip,
  hand: Hand,
  summary: CftSummary,
  rawFilePath: string,
): Promise<void> {
  const { error } = await supabase.from('benchmarks').upsert(
    {
      athlete_id: athleteId,
      test_round: testRound,
      type: 'cft',
      grip,
      hand,
      critical_force: summary.criticalForce,
      cf_ratio: summary.cfRatio,
      cf_min: summary.cfMin,
      threshold_zone: summary.thresholdZone,
      arc_zone: summary.arcZone,
      bodyweight_kg: summary.bodyweight,
      raw_file_path: rawFilePath,
      raw_json: summary, // rep-level series, rawReadings already stripped by the parser
      tested_at: new Date().toISOString(),
    },
    { onConflict: 'athlete_id,test_round,type,grip,hand' },
  );
  throwIf(error);
}

/**
 * Delete every uploaded CFT file for a test round (accidental uploads), plus
 * the benchmark rows parsed from them. MVC entries and the program are untouched.
 */
export async function clearCftUploads(
  userId: string,
  athleteId: string,
  testRound: 1 | 2,
): Promise<number> {
  const folder = `${userId}/round${testRound}`;
  const { data: files, error: listErr } = await supabase.storage.from('cft-files').list(folder);
  throwIf(listErr);
  if (files && files.length > 0) {
    const { error: rmErr } = await supabase.storage
      .from('cft-files')
      .remove(files.map((f) => `${folder}/${f.name}`));
    throwIf(rmErr);
  }
  const { error: delErr } = await supabase
    .from('benchmarks')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('test_round', testRound)
    .eq('type', 'cft');
  throwIf(delErr);
  return files?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Program generation (runs once, at baseline benchmark completion)
// ---------------------------------------------------------------------------

export async function createProgram(
  athlete: AthleteRow,
  bodyweightKg: number,
  mvcTotals: Record<Grip, number>,
  programStartMonday: ISODate,
): Promise<void> {
  const plan = generateProgram();

  const { error: weeksErr } = await supabase.from('program_weeks').insert(
    plan.map((w) => ({
      athlete_id: athlete.id,
      week_number: w.weekNumber,
      phase: w.phaseLabel,
      strength_count: w.strengthCount,
      aerobic_count: w.aerobicCount,
      power_endurance_count: w.powerEnduranceCount,
    })),
  );
  throwIf(weeksErr);

  const sessions: Array<Record<string, unknown>> = [];
  for (const w of plan) {
    const push = (type: SessionType, count: number) => {
      for (let i = 0; i < count; i++) {
        sessions.push({ athlete_id: athlete.id, week_number: w.weekNumber, type, is_extra: false });
      }
    };
    push('strength', w.strengthCount);
    push('aerobic', w.aerobicCount);
    push('power_endurance', w.powerEnduranceCount);
    push('mobility', w.mobilityCount);
  }
  const { error: sessErr } = await supabase.from('sessions').insert(sessions);
  throwIf(sessErr);

  const baselineRows = GRIPS.map((grip) => {
    const load = trainingLoadFromMvc(mvcTotals[grip]);
    return {
      athlete_id: athlete.id,
      fortnight: 1,
      grip,
      load_kg: load,
      added_weight_kg: load - bodyweightKg,
      progressed: false,
      hold_reason: null,
    };
  });
  const { error: loadErr } = await supabase
    .from('strength_loads')
    .upsert(baselineRows, { onConflict: 'athlete_id,fortnight,grip' });
  throwIf(loadErr);

  const { error: athErr } = await supabase
    .from('athletes')
    .update({ bodyweight_kg: bodyweightKg, program_start_date: programStartMonday })
    .eq('id', athlete.id);
  throwIf(athErr);
}

export async function updateBodyweight(athleteId: string, bodyweightKg: number): Promise<void> {
  const { error } = await supabase.from('athletes').update({ bodyweight_kg: bodyweightKg }).eq('id', athleteId);
  throwIf(error);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function getProgramWeeks(athleteId: string): Promise<ProgramWeekRow[]> {
  const { data, error } = await supabase
    .from('program_weeks')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('week_number');
  throwIf(error);
  return (data ?? []) as ProgramWeekRow[];
}

export async function getSessionsForWeek(athleteId: string, weekNumber: number): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .eq('week_number', weekNumber)
    .order('created_at');
  throwIf(error);
  return (data ?? []) as SessionRow[];
}

/** Placed sessions in a date range — used for the cross-week validation window. */
export async function getPlacedSessionsInRange(
  athleteId: string,
  from: ISODate,
  to: ISODate,
): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to);
  throwIf(error);
  return (data ?? []) as SessionRow[];
}

export async function getAllSessions(athleteId: string): Promise<SessionRow[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('week_number')
    .order('created_at');
  throwIf(error);
  return (data ?? []) as SessionRow[];
}

export async function getSession(sessionId: string): Promise<SessionRow> {
  const { data, error } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
  throwIf(error);
  return data as SessionRow;
}

export async function updateSessionPlacement(sessionId: string, date: ISODate | null): Promise<void> {
  const patch = date
    ? { scheduled_date: date, status: 'planned' as const }
    : { scheduled_date: null, status: 'unplaced' as const };
  const { error } = await supabase.from('sessions').update(patch).eq('id', sessionId);
  throwIf(error);
}

export async function addExtraSession(
  athleteId: string,
  weekNumber: number,
  type: 'aerobic' | 'easy_climbing',
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .insert({ athlete_id: athleteId, week_number: weekNumber, type, is_extra: true });
  throwIf(error);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
  throwIf(error);
}

export async function logStrengthSession(
  sessionId: string,
  outcome: 'complete' | 'failed',
  gripFailures: GripFailures | null,
  notes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ status: outcome, grip_failures: outcome === 'failed' ? gripFailures : null, notes })
    .eq('id', sessionId);
  throwIf(error);
}

export async function markSessionDone(sessionId: string): Promise<void> {
  const { error } = await supabase.from('sessions').update({ status: 'complete' }).eq('id', sessionId);
  throwIf(error);
}

/**
 * Undo a logged (complete/failed) session: back to 'planned' on its scheduled
 * day, with the log wiped. Callers must recompute strength loads afterwards —
 * un-failing a strength session changes the progression history.
 */
export async function unmarkSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'planned', grip_failures: null, notes: null })
    .eq('id', sessionId);
  throwIf(error);
}

// ---------------------------------------------------------------------------
// Strength loads (history + idempotent recompute)
// ---------------------------------------------------------------------------

export async function getStrengthLoads(athleteId: string): Promise<StrengthLoadRow[]> {
  const { data, error } = await supabase
    .from('strength_loads')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('fortnight');
  throwIf(error);
  return (data ?? []) as StrengthLoadRow[];
}

/**
 * Recompute the whole load history from baseline + logs and upsert it.
 * Deterministic, so safe to call after every strength log and on week-board load.
 * Only fortnights the athlete has reached are materialised.
 */
export async function recomputeStrengthLoads(athlete: AthleteRow): Promise<void> {
  if (!athlete.program_start_date) return;
  const currentWeek = weekNumberFor(athlete.program_start_date, todayISO());
  const reachedFortnight =
    currentWeek === null
      ? LAST_STRENGTH_FORTNIGHT + 1 // program over (or not started): everything decided
      : fortnightOfWeek(Math.min(currentWeek, 12)) ?? LAST_STRENGTH_FORTNIGHT + 1;

  const loads = await getStrengthLoads(athlete.id);
  const baseline = loads.filter((l) => l.fortnight === 1);
  if (baseline.length < GRIPS.length) return; // not benchmarked yet

  const { data, error } = await supabase
    .from('sessions')
    .select('week_number,status,grip_failures')
    .eq('athlete_id', athlete.id)
    .eq('type', 'strength')
    .lte('week_number', 10);
  throwIf(error);
  const sessionLogs: StrengthSessionLog[] = ((data ?? []) as Array<{
    week_number: number;
    status: StrengthSessionLog['status'];
    grip_failures: StrengthSessionLog['gripFailures'];
  }>).map((r) => ({ weekNumber: r.week_number, status: r.status, gripFailures: r.grip_failures }));

  const baselineLoads = Object.fromEntries(
    baseline.map((b) => [b.grip, b.load_kg]),
  ) as Record<Grip, number>;

  const history = computeLoadHistory(
    baselineLoads,
    sessionLogs,
    athlete.strength_progression_kg,
    Math.min(reachedFortnight, LAST_STRENGTH_FORTNIGHT),
  );

  const rows = history.map((h) => ({
    athlete_id: athlete.id,
    fortnight: h.fortnight,
    grip: h.grip,
    load_kg: h.loadKg,
    added_weight_kg: athlete.bodyweight_kg === null ? null : h.loadKg - athlete.bodyweight_kg,
    progressed: h.progressed,
    hold_reason: h.holdReason,
  }));
  const { error: upErr } = await supabase
    .from('strength_loads')
    .upsert(rows, { onConflict: 'athlete_id,fortnight,grip' });
  throwIf(upErr);
}

/** Current load per grip = the highest materialised fortnight's row per grip. */
export function currentLoadsFrom(loads: StrengthLoadRow[]): Partial<Record<Grip, StrengthLoadRow>> {
  const out: Partial<Record<Grip, StrengthLoadRow>> = {};
  for (const row of loads) {
    const existing = out[row.grip];
    if (!existing || row.fortnight > existing.fortnight) out[row.grip] = row;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aerobic progressions
// ---------------------------------------------------------------------------

export async function getAerobicProgressions(athleteId: string): Promise<AerobicProgressionRow[]> {
  const { data, error } = await supabase
    .from('aerobic_progressions')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('fortnight');
  throwIf(error);
  return (data ?? []) as AerobicProgressionRow[];
}

export async function addAerobicProgression(
  athleteId: string,
  entry: Omit<AerobicProgressionRow, 'id' | 'athlete_id'>,
): Promise<void> {
  const { error } = await supabase
    .from('aerobic_progressions')
    .insert({ athlete_id: athleteId, ...entry });
  throwIf(error);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function weekDates(programStartMonday: ISODate, weekNumber: number): ISODate[] {
  const monday = mondayOfWeek(programStartMonday, weekNumber);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
