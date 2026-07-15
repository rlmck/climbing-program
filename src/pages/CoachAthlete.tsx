import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  getAerobicProgressions,
  getAthlete,
  getBenchmarks,
  getSessionsForWeek,
  getStrengthLoads,
  weekDates,
} from '../lib/api';
import type { AerobicProgressionRow, AthleteRow, BenchmarkRow, SessionRow, StrengthLoadRow } from '../lib/db';
import CftDecayChart from '../components/CftDecayChart';
import { LoadHistoryChart, LoadHistoryList, MvcComparison } from '../components/LoadHistory';
import { todayISO, weekNumberFor } from '../domain/dates';
import { GRIPS, type SessionType } from '../domain/types';

const TYPE_SHORT: Record<SessionType, string> = {
  strength: 'STR',
  aerobic: 'AER',
  power_endurance: 'PE',
  easy_climbing: 'EASY',
  mobility: 'MOB',
};

const TYPE_COLOR: Record<SessionType, string> = {
  strength: 'bg-rose-900 text-rose-200',
  aerobic: 'bg-sky-900 text-sky-200',
  power_endurance: 'bg-violet-900 text-violet-200',
  easy_climbing: 'bg-teal-900 text-teal-200',
  mobility: 'bg-amber-900 text-amber-200',
};

export default function CoachAthlete() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const { athlete: me } = useAuth();
  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [viewWeek, setViewWeek] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkRow[]>([]);
  const [loads, setLoads] = useState<StrengthLoadRow[]>([]);
  const [aerobic, setAerobic] = useState<AerobicProgressionRow[]>([]);

  useEffect(() => {
    if (!athleteId) return;
    void getAthlete(athleteId).then((a) => {
      setAthlete(a);
      const wk = a.program_start_date ? weekNumberFor(a.program_start_date, todayISO()) : null;
      setViewWeek(wk ?? 1);
    });
  }, [athleteId]);

  useEffect(() => {
    if (!athleteId) return;
    void Promise.all([
      getBenchmarks(athleteId),
      getStrengthLoads(athleteId),
      getAerobicProgressions(athleteId),
    ]).then(([b, l, a]) => {
      setBenchmarks(b);
      setLoads(l);
      setAerobic(a);
    });
  }, [athleteId]);

  useEffect(() => {
    if (!athleteId || viewWeek === null) return;
    void getSessionsForWeek(athleteId, viewWeek).then(setSessions);
  }, [athleteId, viewWeek]);

  const days = useMemo(
    () =>
      athlete?.program_start_date && viewWeek !== null
        ? weekDates(athlete.program_start_date, viewWeek)
        : [],
    [athlete, viewWeek],
  );

  if (!me?.is_coach) return null;
  if (!athlete) return <p className="text-slate-400">Loading…</p>;

  const cft = benchmarks.filter((b) => b.type === 'cft');
  const unplaced = sessions.filter((s) => s.status === 'unplaced');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{athlete.name}</h1>
        <Link to="/coach" className="text-sm text-slate-400 hover:text-slate-200">
          ← All athletes
        </Link>
      </div>

      {!athlete.program_start_date && (
        <div className="card text-sm text-amber-400">Not benchmarked yet — no program.</div>
      )}

      {athlete.program_start_date && viewWeek !== null && (
        <div className="card">
          <div className="flex items-center justify-between">
            <button
              className="btn-secondary !px-3 !py-1"
              disabled={viewWeek <= 1}
              onClick={() => setViewWeek((w) => (w ?? 1) - 1)}
            >
              ←
            </button>
            <div className="text-sm font-semibold">Week {viewWeek} (read-only)</div>
            <button
              className="btn-secondary !px-3 !py-1"
              disabled={viewWeek >= 13}
              onClick={() => setViewWeek((w) => (w ?? 1) + 1)}
            >
              →
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center">
            {days.map((date) => {
              const day = sessions.filter((s) => s.scheduled_date === date);
              return (
                <div key={date} className="rounded-lg border border-slate-800 p-1">
                  <div className="text-[10px] text-slate-500">
                    {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
                    <br />
                    {date.slice(8)}
                  </div>
                  <div className="mt-1 space-y-1">
                    {day.map((s) => (
                      <div key={s.id} className={`rounded px-0.5 py-0.5 text-[9px] font-bold ${TYPE_COLOR[s.type]}`}>
                        {TYPE_SHORT[s.type]}
                        {s.status === 'complete' && ' ✓'}
                        {s.status === 'failed' && ' ✗'}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {unplaced.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">{unplaced.length} session(s) not yet placed.</p>
          )}
        </div>
      )}

      <LoadHistoryList loads={loads} />
      <LoadHistoryChart loads={loads} />
      <MvcComparison benchmarks={benchmarks} />
      {GRIPS.map((grip) => (
        <CftDecayChart key={grip} grip={grip} rows={cft.filter((b) => b.grip === grip)} />
      ))}

      {aerobic.length > 0 && (
        <div className="card">
          <h3 className="font-semibold">Aerobic progression</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {aerobic.map((a) => (
              <li key={a.id}>
                <span className="chip mr-2 bg-sky-900 text-sky-300">F{a.fortnight}</span>
                grade {a.grade} · length {a.route_length} · TUT {a.tut_seconds}s
                {a.variable_bumped ? (
                  <span className="text-slate-500"> — bumped {a.variable_bumped}</span>
                ) : (
                  <span className="text-slate-500"> — baseline</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
