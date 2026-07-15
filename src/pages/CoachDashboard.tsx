import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  currentLoadsFrom,
  getAllSessions,
  getProgramWeeks,
  getStrengthLoads,
  listAthletes,
} from '../lib/api';
import type { AthleteRow, SessionRow } from '../lib/db';
import { formatUK, todayISO, weekNumberFor } from '../domain/dates';
import { formatKg } from '../domain/loads';
import { GRIPS, GRIP_LABEL } from '../domain/types';

interface AthleteSummary {
  athlete: AthleteRow;
  currentWeek: number | null;
  phase: string | null;
  loads: Partial<Record<string, { load_kg: number }>>;
  loggedThisWeek: number;
  prescribedThisWeek: number;
  lastLogged: string | null;
  failedSessions: SessionRow[];
}

export default function CoachDashboard() {
  const { athlete: me } = useAuth();
  const [summaries, setSummaries] = useState<AthleteSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const athletes = (await listAthletes()).filter((a) => a.is_athlete);
      const out: AthleteSummary[] = [];
      for (const a of athletes) {
        const currentWeek = a.program_start_date
          ? weekNumberFor(a.program_start_date, todayISO())
          : null;
        const [weeks, sessions, loads] = await Promise.all([
          getProgramWeeks(a.id),
          getAllSessions(a.id),
          getStrengthLoads(a.id),
        ]);
        const thisWeek = sessions.filter((s) => s.week_number === currentWeek && !s.is_extra);
        const logged = sessions
          .filter((s) => s.status === 'complete' || s.status === 'failed')
          .sort((x, y) => (x.scheduled_date ?? '').localeCompare(y.scheduled_date ?? ''));
        out.push({
          athlete: a,
          currentWeek,
          phase: weeks.find((w) => w.week_number === currentWeek)?.phase ?? null,
          loads: currentLoadsFrom(loads),
          loggedThisWeek: thisWeek.filter((s) => s.status === 'complete' || s.status === 'failed').length,
          prescribedThisWeek: thisWeek.length,
          lastLogged: logged.length ? logged[logged.length - 1].scheduled_date : null,
          failedSessions: sessions.filter((s) => s.status === 'failed'),
        });
      }
      setSummaries(out);
      setLoaded(true);
    })();
  }, []);

  if (!me?.is_coach) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Coach dashboard</h1>
      <p className="text-xs text-slate-500">
        Read-only in v1 — load and session changes happen through each athlete&apos;s own account.
      </p>
      {!loaded && <p className="text-slate-400">Loading athletes…</p>}
      {summaries.map((s) => (
        <Link
          key={s.athlete.id}
          to={`/coach/${s.athlete.id}`}
          className="card block transition-colors hover:border-slate-600"
        >
          <div className="flex items-baseline justify-between">
            <div className="font-bold">{s.athlete.name}</div>
            {s.athlete.program_start_date ? (
              <div className="text-sm text-slate-400">
                {s.currentWeek ? `Week ${s.currentWeek} · ${s.phase ?? ''}` : 'Outside program window'}
              </div>
            ) : (
              <span className="chip bg-amber-900 text-amber-300">Not benchmarked</span>
            )}
          </div>

          {s.athlete.program_start_date && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs text-slate-500">This week</div>
                <div>
                  {s.loggedThisWeek}/{s.prescribedThisWeek} logged
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Last logged</div>
                <div>{s.lastLogged ? formatUK(s.lastLogged) : '—'}</div>
              </div>
              {GRIPS.map((grip) => (
                <div key={grip}>
                  <div className="text-xs text-slate-500">{GRIP_LABEL[grip]}</div>
                  <div>{s.loads[grip] ? formatKg(s.loads[grip]!.load_kg) : '—'}</div>
                </div>
              ))}
            </div>
          )}

          {s.failedSessions.length > 0 && (
            <div className="mt-2 text-xs text-rose-400">
              ⚠ {s.failedSessions.length} failed strength session(s) —{' '}
              {s.failedSessions
                .map((f) => `wk ${f.week_number}`)
                .join(', ')}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
