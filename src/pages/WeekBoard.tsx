import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useAuth } from '../lib/AuthContext';
import {
  addAerobicProgression,
  addExtraSession,
  deleteSession,
  getAerobicProgressions,
  getPlacedSessionsInRange,
  getProgramWeeks,
  getSessionsForWeek,
  getStrengthLoads,
  markSessionDone,
  recomputeStrengthLoads,
  unmarkSession,
  updateSessionPlacement,
  currentLoadsFrom,
  weekDates,
} from '../lib/api';
import type { AerobicProgressionRow, ProgramWeekRow, SessionRow, StrengthLoadRow } from '../lib/db';
import { validatePlacement, type Placement, type ValidationResult } from '../domain/scheduling';
import { addDays, formatDayMonth, formatUK, todayISO, weekNumberFor } from '../domain/dates';
import { fortnightOfWeek, LAST_AEROBIC_FORTNIGHT } from '../domain/program';
import { AEROBIC_GUIDANCE, MOBILITY_GUIDANCE, PE_GUIDANCE, WEEK13_GUIDANCE } from '../domain/constants';
import { displayWeight, formatKg } from '../domain/loads';
import { GRIPS, GRIP_LABEL, type AerobicVariable, type SessionType } from '../domain/types';

const TYPE_LABEL: Record<SessionType, string> = {
  strength: 'Strength',
  aerobic: 'Aerobic',
  power_endurance: 'Power endurance',
  easy_climbing: 'Easy climbing',
  mobility: 'Mobility',
};

const TYPE_STYLE: Record<SessionType, string> = {
  strength: 'bg-rose-900/70 border-rose-700',
  aerobic: 'bg-sky-900/70 border-sky-700',
  power_endurance: 'bg-violet-900/70 border-violet-700',
  easy_climbing: 'bg-teal-900/70 border-teal-700',
  mobility: 'bg-amber-900/60 border-amber-700',
};

interface Feedback {
  kind: 'block' | 'hint';
  messages: string[];
}

export default function WeekBoard() {
  const { athlete } = useAuth();
  const start = athlete?.program_start_date ?? null;
  const currentWeek = start ? weekNumberFor(start, todayISO()) : null;
  const [viewWeek, setViewWeek] = useState(() => Math.min(Math.max(currentWeek ?? 1, 1), 13));

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [windowSessions, setWindowSessions] = useState<SessionRow[]>([]);
  const [programWeek, setProgramWeek] = useState<ProgramWeekRow | null>(null);
  const [loads, setLoads] = useState<StrengthLoadRow[]>([]);
  const [aerobic, setAerobic] = useState<AerobicProgressionRow[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hover, setHover] = useState<{ date: string; ok: boolean } | null>(null);

  const days = useMemo(() => (start ? weekDates(start, viewWeek) : []), [start, viewWeek]);

  const reload = useCallback(async () => {
    if (!athlete || !start) return;
    const [sess, win, weeks, lds, aer] = await Promise.all([
      getSessionsForWeek(athlete.id, viewWeek),
      getPlacedSessionsInRange(
        athlete.id,
        addDays(weekDates(start, viewWeek)[0], -7),
        addDays(weekDates(start, viewWeek)[6], 7),
      ),
      getProgramWeeks(athlete.id),
      getStrengthLoads(athlete.id),
      getAerobicProgressions(athlete.id),
    ]);
    setSessions(sess);
    setWindowSessions(win);
    setProgramWeek(weeks.find((w) => w.week_number === viewWeek) ?? null);
    setLoads(lds);
    setAerobic(aer);
  }, [athlete, start, viewWeek]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Materialise progression/hold rows when a new fortnight starts (idempotent).
  useEffect(() => {
    if (athlete && start) void recomputeStrengthLoads(athlete).then(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athlete?.id, start]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const placements: Placement[] = useMemo(
    () =>
      windowSessions
        .filter((s) => s.scheduled_date !== null)
        .map((s) => ({ id: s.id, date: s.scheduled_date!, type: s.type, isExtra: s.is_extra })),
    [windowSessions],
  );

  const validateDrop = useCallback(
    (session: SessionRow, date: string): ValidationResult => {
      const weekSet = new Set(days);
      return validatePlacement(
        placements.filter((p) => weekSet.has(p.date)),
        { id: session.id, date, type: session.type, isExtra: session.is_extra },
        { adjacentPlacements: placements.filter((p) => !weekSet.has(p.date)) },
      );
    },
    [placements, days],
  );

  function findSession(id: string | number | undefined): SessionRow | undefined {
    return sessions.find((s) => s.id === String(id));
  }

  function onDragOver(e: DragOverEvent) {
    const session = findSession(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!session || !overId || !overId.startsWith('day-')) {
      setHover(null);
      return;
    }
    const date = overId.slice(4);
    setHover({ date, ok: validateDrop(session, date).ok });
  }

  async function onDragEnd(e: DragEndEvent) {
    setHover(null);
    const session = findSession(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!session || !overId) return;

    if (overId === 'tray') {
      if (session.scheduled_date !== null && (session.status === 'planned' || session.status === 'unplaced')) {
        await updateSessionPlacement(session.id, null);
        setFeedback(null);
        await reload();
      }
      return;
    }
    if (!overId.startsWith('day-')) return;
    const date = overId.slice(4);
    if (session.scheduled_date === date) return;

    const result = validateDrop(session, date);
    if (!result.ok) {
      setFeedback({ kind: 'block', messages: result.blocks });
      return; // session stays where it was (tray or previous day)
    }
    await updateSessionPlacement(session.id, date);
    setFeedback(result.hints.length ? { kind: 'hint', messages: result.hints } : null);
    await reload();
  }

  if (!athlete || !start || currentWeek === undefined) return null;
  if (!athlete.is_athlete) return <p className="text-slate-400">This account has no athlete program.</p>;

  const tray = sessions.filter((s) => s.status === 'unplaced');
  const currentLoads = currentLoadsFrom(loads);
  const fortnight = fortnightOfWeek(viewWeek);
  const latestAerobic = aerobic.length ? aerobic[aerobic.length - 1] : null;
  const needsBaseline = fortnight === 1 && !aerobic.some((a) => a.fortnight === 1);
  const needsBump =
    fortnight !== null &&
    fortnight >= 2 &&
    fortnight <= LAST_AEROBIC_FORTNIGHT &&
    currentWeek !== null &&
    fortnightOfWeek(Math.min(currentWeek, 12)) === fortnight &&
    aerobic.some((a) => a.fortnight === 1) &&
    !aerobic.some((a) => a.fortnight === fortnight);

  return (
    <DndContext sensors={sensors} onDragOver={onDragOver} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            className="btn-secondary !px-3 !py-1.5"
            disabled={viewWeek <= 1}
            onClick={() => setViewWeek((w) => w - 1)}
          >
            ←
          </button>
          <div className="text-center">
            <div className="font-bold">
              Week {viewWeek} of 13
              {viewWeek === currentWeek && (
                <span className="chip ml-2 bg-emerald-900 text-emerald-300">current</span>
              )}
            </div>
            <div className="text-xs text-slate-400">{programWeek?.phase ?? ''}</div>
          </div>
          <button
            className="btn-secondary !px-3 !py-1.5"
            disabled={viewWeek >= 13}
            onClick={() => setViewWeek((w) => w + 1)}
          >
            →
          </button>
        </div>

        {currentWeek === null && (
          <div className="card text-sm text-amber-400">
            Today is outside the 13-week program window (started {formatUK(start)}).
          </div>
        )}

        {viewWeek <= 10 && (
          <div className="card !p-3">
            <div className="text-xs uppercase tracking-wider text-slate-500">Current hang loads</div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
              {GRIPS.map((grip) => {
                const row = currentLoads[grip];
                if (!row) return <div key={grip} className="text-slate-500">—</div>;
                const dw =
                  athlete.bodyweight_kg !== null
                    ? displayWeight(row.load_kg, athlete.bodyweight_kg)
                    : null;
                return (
                  <div key={grip}>
                    <div className="font-semibold">{GRIP_LABEL[grip]}</div>
                    <div className="text-slate-300">
                      {formatKg(row.load_kg)} total
                      {dw &&
                        (dw.mode === 'added'
                          ? ` · +${formatKg(dw.kg)}`
                          : ` · ${formatKg(dw.kg)} assisted`)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`card !p-3 text-sm ${
              feedback.kind === 'block'
                ? '!border-rose-700 !bg-rose-950/60 text-rose-200'
                : '!border-emerald-700 !bg-emerald-950/60 text-emerald-200'
            }`}
            onClick={() => setFeedback(null)}
          >
            {feedback.messages.map((m) => (
              <p key={m}>{feedback.kind === 'block' ? '✕ ' : '✓ '}{m}</p>
            ))}
          </div>
        )}

        {viewWeek === 13 && (
          <div className="card !border-teal-800 text-sm text-teal-200">
            <div className="font-semibold">Deload week</div>
            <p className="mt-1">{WEEK13_GUIDANCE}</p>
            <Link to="/retest" className="btn-primary mt-3">
              Run the retest (MVC + 4 CFT files)
            </Link>
          </div>
        )}

        {needsBaseline && <AerobicBaselineCard athleteId={athlete.id} onSaved={reload} />}
        {needsBump && fortnight !== null && latestAerobic && (
          <AerobicBumpCard
            athleteId={athlete.id}
            fortnight={fortnight}
            latest={latestAerobic}
            onSaved={reload}
          />
        )}
        {latestAerobic && !needsBaseline && !needsBump && (
          <div className="card !p-3 text-xs text-slate-400">
            Aerobic targets: grade {latestAerobic.grade} · length {latestAerobic.route_length} · TUT{' '}
            {latestAerobic.tut_seconds}s — {AEROBIC_GUIDANCE}
          </div>
        )}

        <Tray sessions={tray} onDelete={async (id) => { await deleteSession(id); await reload(); }} />

        <div className="space-y-2">
          {days.map((date) => (
            <DayCell
              key={date}
              date={date}
              hover={hover}
              sessions={sessions.filter((s) => s.scheduled_date === date)}
              currentLoads={currentLoads}
              bodyweight={athlete.bodyweight_kg}
              onMarkDone={async (id) => {
                await markSessionDone(id);
                await reload();
              }}
              onUnmark={async (s) => {
                await unmarkSession(s.id);
                if (s.type === 'strength') await recomputeStrengthLoads(athlete);
                await reload();
              }}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {viewWeek <= 12 && (
            <button
              className="btn-secondary flex-1"
              onClick={async () => {
                await addExtraSession(athlete.id, viewWeek, 'aerobic');
                await reload();
              }}
            >
              + Extra aerobic session
            </button>
          )}
          {viewWeek === 13 && (
            <button
              className="btn-secondary flex-1"
              onClick={async () => {
                await addExtraSession(athlete.id, 13, 'easy_climbing');
                await reload();
              }}
            >
              + Easy climbing day
            </button>
          )}
        </div>
        <p className="pb-4 text-center text-xs text-slate-600">
          Drag sessions onto days. Unplaced sessions lapse at the end of the week — nothing is
          rescheduled automatically.
        </p>
      </div>
    </DndContext>
  );
}

function Tray({
  sessions,
  onDelete,
}: {
  sessions: SessionRow[];
  onDelete: (id: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tray' });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 border-dashed p-3 ${
        isOver ? 'border-slate-500 bg-slate-900' : 'border-slate-800'
      }`}
    >
      <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">
        To schedule ({sessions.length}) — drop here to unschedule
      </div>
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-600">Everything placed. 🎉</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} compact onDelete={s.is_extra ? onDelete : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayCell({
  date,
  sessions,
  hover,
  currentLoads,
  bodyweight,
  onMarkDone,
  onUnmark,
}: {
  date: string;
  sessions: SessionRow[];
  hover: { date: string; ok: boolean } | null;
  currentLoads: Partial<Record<string, StrengthLoadRow>>;
  bodyweight: number | null;
  onMarkDone: (id: string) => Promise<void>;
  onUnmark: (session: SessionRow) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${date}` });
  const isToday = date === todayISO();
  const hovered = hover?.date === date;
  const border = hovered
    ? hover.ok
      ? 'border-emerald-500'
      : 'border-rose-600'
    : isOver
      ? 'border-slate-500'
      : 'border-slate-800';
  const dayName = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

  return (
    <div ref={setNodeRef} className={`rounded-xl border-2 bg-slate-900/60 p-2 transition-colors ${border}`}>
      <div className="flex items-baseline justify-between px-1">
        <span className={`text-sm font-bold ${isToday ? 'text-emerald-400' : ''}`}>{dayName}</span>
        <span className="text-xs text-slate-500">{formatDayMonth(date)}</span>
      </div>
      <div className="mt-1 min-h-[2.25rem] space-y-1.5">
        {sessions.length === 0 && <div className="px-1 text-xs text-slate-700">Rest</div>}
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            currentLoads={currentLoads}
            bodyweight={bodyweight}
            onMarkDone={onMarkDone}
            onUnmark={onUnmark}
          />
        ))}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  compact = false,
  currentLoads,
  bodyweight,
  onMarkDone,
  onUnmark,
  onDelete,
}: {
  session: SessionRow;
  compact?: boolean;
  currentLoads?: Partial<Record<string, StrengthLoadRow>>;
  bodyweight?: number | null;
  onMarkDone?: (id: string) => Promise<void>;
  onUnmark?: (session: SessionRow) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}) {
  const draggable = session.status === 'unplaced' || session.status === 'planned';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: session.id,
    disabled: !draggable,
  });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  const logged = session.status === 'complete' || session.status === 'failed';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`relative touch-none select-none rounded-lg border p-2 text-sm ${TYPE_STYLE[session.type]} ${
        isDragging ? 'opacity-70 shadow-xl' : ''
      } ${draggable ? 'cursor-grab' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {TYPE_LABEL[session.type]}
          {session.is_extra && <span className="ml-1 text-xs font-normal opacity-70">(extra)</span>}
        </span>
        <span className="text-xs">
          {session.status === 'complete' && '✅'}
          {session.status === 'failed' && '❌'}
        </span>
      </div>

      {!compact && session.type === 'strength' && (
        <div className="mt-1 text-xs opacity-90">
          {GRIPS.map((grip) => {
            const row = currentLoads?.[grip];
            if (!row) return null;
            const dw = bodyweight != null ? displayWeight(row.load_kg, bodyweight) : null;
            return (
              <div key={grip}>
                {GRIP_LABEL[grip]}: {formatKg(row.load_kg)}
                {dw && (dw.mode === 'added' ? ` (+${formatKg(dw.kg)})` : ` (${formatKg(dw.kg)} assist)`)}
              </div>
            );
          })}
          {!logged && session.scheduled_date && (
            <Link
              to={`/session/${session.id}`}
              className="mt-1 inline-block rounded bg-slate-950/50 px-2 py-1 font-semibold"
              onPointerDown={(e) => e.stopPropagation()}
            >
              Open session →
            </Link>
          )}
          {logged && (
            <Link
              to={`/session/${session.id}`}
              className="mt-1 inline-block text-xs underline opacity-80"
              onPointerDown={(e) => e.stopPropagation()}
            >
              View log
            </Link>
          )}
        </div>
      )}

      {!compact && session.type === 'power_endurance' && (
        <p className="mt-1 text-xs leading-snug opacity-80">{PE_GUIDANCE}</p>
      )}

      {!compact && session.type === 'mobility' && (
        <p className="mt-1 text-xs leading-snug opacity-80">{MOBILITY_GUIDANCE}</p>
      )}

      {!compact &&
        session.type !== 'strength' &&
        session.status === 'planned' &&
        onMarkDone && (
          <button
            className="mt-1.5 rounded bg-slate-950/50 px-2 py-1 text-xs font-semibold"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void onMarkDone(session.id)}
          >
            Mark done ✓
          </button>
        )}

      {!compact && logged && onUnmark && (
        <button
          className="mt-1.5 rounded bg-slate-950/50 px-2 py-1 text-xs font-semibold opacity-80"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void onUnmark(session)}
        >
          ↩ Undo{session.type === 'strength' ? ' log' : ''}
        </button>
      )}

      {onDelete && session.is_extra && (
        <button
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-xs"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void onDelete(session.id)}
          aria-label="Remove extra session"
        >
          ×
        </button>
      )}
    </div>
  );
}

function AerobicBaselineCard({ athleteId, onSaved }: { athleteId: string; onSaved: () => Promise<void> }) {
  const [grade, setGrade] = useState('');
  const [length, setLength] = useState('');
  const [tut, setTut] = useState('');
  const valid = grade.trim() && length.trim() && parseInt(tut, 10) > 0;
  return (
    <div className="card !border-sky-800 space-y-2">
      <div className="font-semibold text-sky-200">Aerobic baseline (weeks 1–2)</div>
      <p className="text-xs text-slate-400">{AEROBIC_GUIDANCE} Record your starting point:</p>
      <div className="grid grid-cols-3 gap-2">
        <input className="input" placeholder="Grade (e.g. 6a)" value={grade} onChange={(e) => setGrade(e.target.value)} />
        <input className="input" placeholder="Length (e.g. 20m)" value={length} onChange={(e) => setLength(e.target.value)} />
        <input className="input" placeholder="TUT (s)" type="number" inputMode="numeric" value={tut} onChange={(e) => setTut(e.target.value)} />
      </div>
      <button
        className="btn-primary w-full"
        disabled={!valid}
        onClick={async () => {
          await addAerobicProgression(athleteId, {
            fortnight: 1,
            grade: grade.trim(),
            route_length: length.trim(),
            tut_seconds: parseInt(tut, 10),
            variable_bumped: null,
          });
          await onSaved();
        }}
      >
        Save baseline
      </button>
    </div>
  );
}

function AerobicBumpCard({
  athleteId,
  fortnight,
  latest,
  onSaved,
}: {
  athleteId: string;
  fortnight: number;
  latest: AerobicProgressionRow;
  onSaved: () => Promise<void>;
}) {
  const [variable, setVariable] = useState<AerobicVariable | null>(null);
  const [value, setValue] = useState('');
  const valid = variable !== null && value.trim() !== '' && (variable !== 'tut' || parseInt(value, 10) > 0);

  return (
    <div className="card !border-sky-800 space-y-2">
      <div className="font-semibold text-sky-200">
        New fortnight — bump ONE aerobic variable (progression #{fortnight - 1})
      </div>
      <p className="text-xs text-slate-400">
        Fixed calendar, no completion gate. Current: grade {latest.grade} · length {latest.route_length} ·
        TUT {latest.tut_seconds}s. Pick one to raise; the other two carry forward.
      </p>
      <div className="flex gap-2">
        {(['grade', 'length', 'tut'] as const).map((v) => (
          <button
            key={v}
            className={`btn flex-1 border text-xs ${
              variable === v ? 'border-sky-500 bg-sky-900 text-sky-100' : 'border-slate-700 bg-slate-800'
            }`}
            onClick={() => {
              setVariable(v);
              setValue('');
            }}
          >
            {v === 'tut' ? 'TUT' : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      {variable && (
        <input
          className="input"
          placeholder={
            variable === 'grade'
              ? `New grade (was ${latest.grade})`
              : variable === 'length'
                ? `New length (was ${latest.route_length})`
                : `New TUT in seconds (was ${latest.tut_seconds})`
          }
          type={variable === 'tut' ? 'number' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      <button
        className="btn-primary w-full"
        disabled={!valid}
        onClick={async () => {
          await addAerobicProgression(athleteId, {
            fortnight,
            grade: variable === 'grade' ? value.trim() : latest.grade,
            route_length: variable === 'length' ? value.trim() : latest.route_length,
            tut_seconds: variable === 'tut' ? parseInt(value, 10) : latest.tut_seconds,
            variable_bumped: variable,
          });
          await onSaved();
        }}
      >
        Record bump
      </button>
    </div>
  );
}
