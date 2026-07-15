import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  getSession,
  getStrengthLoads,
  logStrengthSession,
  recomputeStrengthLoads,
  unmarkSession,
  currentLoadsFrom,
} from '../lib/api';
import type { SessionRow, StrengthLoadRow } from '../lib/db';
import { STRENGTH_PROTOCOL } from '../domain/constants';
import { displayWeight, formatKg } from '../domain/loads';
import { GRIPS, GRIP_LABEL, type Grip, type GripFailures } from '../domain/types';
import { fortnightOfWeek } from '../domain/program';

export default function StrengthSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { athlete } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [loads, setLoads] = useState<StrengthLoadRow[]>([]);
  const [outcome, setOutcome] = useState<'complete' | 'failed' | null>(null);
  const [gripFailed, setGripFailed] = useState<Record<Grip, boolean>>({
    half_crimp: false,
    three_finger_drag: false,
  });
  const [failedSets, setFailedSets] = useState<Record<Grip, number[]>>({
    half_crimp: [],
    three_finger_drag: [],
  });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !athlete) return;
    void Promise.all([getSession(sessionId), getStrengthLoads(athlete.id)]).then(([s, l]) => {
      setSession(s);
      setLoads(l);
      setNotes(s.notes ?? '');
    });
  }, [sessionId, athlete]);

  if (!session || !athlete) return <p className="text-slate-400">Loading…</p>;
  if (session.type !== 'strength') return <p className="text-slate-400">Not a strength session.</p>;

  const fortnight = fortnightOfWeek(session.week_number);
  // Loads for the session's own fortnight (falls back to latest materialised).
  const fortnightLoads = loads.filter((l) => l.fortnight === fortnight);
  const loadByGrip =
    fortnightLoads.length === GRIPS.length
      ? Object.fromEntries(fortnightLoads.map((l) => [l.grip, l]))
      : currentLoadsFrom(loads);

  const logged = session.status === 'complete' || session.status === 'failed';
  const p = STRENGTH_PROTOCOL;

  async function submit() {
    if (!session || !athlete || !outcome) return;
    setBusy(true);
    setError(null);
    try {
      const gripFailures: GripFailures | null =
        outcome === 'failed'
          ? {
              half_crimp: {
                failed: gripFailed.half_crimp,
                sets: gripFailed.half_crimp ? failedSets.half_crimp : [],
              },
              three_finger_drag: {
                failed: gripFailed.three_finger_drag,
                sets: gripFailed.three_finger_drag ? failedSets.three_finger_drag : [],
              },
            }
          : null;
      await logStrengthSession(session.id, outcome, gripFailures, notes.trim() || null);
      await recomputeStrengthLoads(athlete);
      navigate('/week');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Strength session — week {session.week_number}</h1>
        <p className="text-sm text-slate-400">
          {p.setsPerGrip * 2} sets total: {p.setsPerGrip} × half-crimp, {p.setsPerGrip} ×
          three-finger drag · {p.repsPerSet} rep/set · {p.hangSeconds}s hang · {p.restMinutes} min
          rest between sets · {p.edgeMm}mm edge
        </p>
      </div>

      {GRIPS.map((grip) => {
        const row = (loadByGrip as Partial<Record<Grip, StrengthLoadRow>>)[grip];
        const dw =
          row && athlete.bodyweight_kg !== null
            ? displayWeight(row.load_kg, athlete.bodyweight_kg)
            : null;
        return (
          <div key={grip} className="card">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{GRIP_LABEL[grip]}</h2>
              <span className="text-xs text-slate-500">
                {p.setsPerGrip} sets · {p.hangSeconds}s · rest {p.restMinutes} min
              </span>
            </div>
            {row ? (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Total load</div>
                  <div className="text-lg font-bold">{formatKg(row.load_kg)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">
                    {dw?.mode === 'assisted' ? 'Assistance (pulley)' : 'Added weight'}
                  </div>
                  <div className="text-lg font-bold">
                    {dw ? (dw.mode === 'added' ? `+${formatKg(dw.kg)}` : `−${formatKg(dw.kg)}`) : '—'}
                  </div>
                  {dw?.mode === 'assisted' && (
                    <div className="text-xs text-amber-400">take weight OFF via pulley/band</div>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No load on record — complete benchmarking first.</p>
            )}
          </div>
        );
      })}

      {logged ? (
        <div className="card">
          <div className="font-semibold">
            Logged: {session.status === 'complete' ? 'Complete ✅' : 'Failed ❌'}
          </div>
          {session.status === 'failed' && session.grip_failures && (
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              {GRIPS.map((grip) => {
                const gf = session.grip_failures?.[grip];
                return (
                  <li key={grip}>
                    {GRIP_LABEL[grip]}:{' '}
                    {gf?.failed
                      ? `failed${gf.sets?.length ? ` (sets ${gf.sets.join(', ')})` : ''}`
                      : 'all sets held'}
                  </li>
                );
              })}
            </ul>
          )}
          {session.notes && <p className="mt-2 text-sm text-slate-400">“{session.notes}”</p>}
          <button
            className="btn-secondary mt-3 w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await unmarkSession(session.id);
                await recomputeStrengthLoads(athlete);
                const [s, l] = await Promise.all([getSession(session.id), getStrengthLoads(athlete.id)]);
                setSession(s);
                setLoads(l);
                setOutcome(null);
                setNotes('');
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            ↩ Undo this log (re-opens the session)
          </button>
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
        </div>
      ) : (
        <div className="card space-y-3">
          <h2 className="font-semibold">Log this session</h2>
          <div className="flex gap-2">
            <button
              className={`btn flex-1 border ${
                outcome === 'complete'
                  ? 'border-emerald-500 bg-emerald-800 text-white'
                  : 'border-slate-700 bg-slate-800'
              }`}
              onClick={() => setOutcome('complete')}
            >
              Complete — all 8 sets held
            </button>
            <button
              className={`btn flex-1 border ${
                outcome === 'failed'
                  ? 'border-rose-500 bg-rose-900 text-white'
                  : 'border-slate-700 bg-slate-800'
              }`}
              onClick={() => setOutcome('failed')}
            >
              Failed
            </button>
          </div>

          {outcome === 'failed' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Which grip(s) failed? Only the grip-level flag affects progression; set numbers are
                for your own reference.
              </p>
              {GRIPS.map((grip) => (
                <div key={grip} className="rounded-lg border border-slate-800 p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={gripFailed[grip]}
                      onChange={(e) => setGripFailed((prev) => ({ ...prev, [grip]: e.target.checked }))}
                    />
                    {GRIP_LABEL[grip]} failed
                  </label>
                  {gripFailed[grip] && (
                    <div className="mt-2 flex gap-2">
                      {Array.from({ length: p.setsPerGrip }, (_, i) => i + 1).map((set) => (
                        <button
                          key={set}
                          className={`h-9 w-9 rounded-lg border text-sm font-semibold ${
                            failedSets[grip].includes(set)
                              ? 'border-rose-500 bg-rose-900'
                              : 'border-slate-700 bg-slate-800'
                          }`}
                          onClick={() =>
                            setFailedSets((prev) => ({
                              ...prev,
                              [grip]: prev[grip].includes(set)
                                ? prev[grip].filter((s) => s !== set)
                                : [...prev[grip], set].sort(),
                            }))
                          }
                        >
                          {set}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!gripFailed.half_crimp && !gripFailed.three_finger_drag && (
                <p className="text-xs text-amber-400">
                  Tick the grip(s) that actually failed — a failed session needs at least one.
                </p>
              )}
            </div>
          )}

          <textarea
            className="input"
            rows={2}
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button
            className="btn-primary w-full"
            disabled={
              !outcome ||
              busy ||
              (outcome === 'failed' && !gripFailed.half_crimp && !gripFailed.three_finger_drag)
            }
            onClick={() => void submit()}
          >
            {busy ? 'Saving…' : 'Save log'}
          </button>
        </div>
      )}
    </div>
  );
}
