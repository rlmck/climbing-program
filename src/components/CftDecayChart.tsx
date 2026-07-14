import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BenchmarkRow } from '../lib/db';
import type { CftSummary } from '../domain/cft';
import { HANDS, HAND_LABEL, type Grip, type Hand } from '../domain/types';
import { GRIP_LABEL } from '../domain/types';

const HAND_COLOR: Record<Hand, string> = { left: '#38bdf8', right: '#f472b6' };

interface Series {
  hand: Hand;
  round: 1 | 2;
  color: string;
  opacity: number;
  criticalForce: number | null;
  data: Array<{ rep: number; value: number | null; unreliable: boolean }>;
  unreliableCount: number;
  cfRatio: number | null;
  thresholdZone: string | null;
}

function summaryOf(row: BenchmarkRow): CftSummary | null {
  const j = row.raw_json;
  if (j && typeof j === 'object' && Array.isArray((j as CftSummary).reps)) return j as CftSummary;
  return null;
}

/* Hollow markers for unreliable reps — de-emphasised, never dropped. */
function RepDot(props: {
  cx?: number;
  cy?: number;
  stroke?: string;
  payload?: { unreliable?: boolean };
}) {
  const { cx, cy, stroke, payload } = props;
  if (cx == null || cy == null) return null;
  const unreliable = payload?.unreliable === true;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={unreliable ? 3.5 : 2.5}
      stroke={stroke}
      strokeWidth={1.5}
      strokeDasharray={unreliable ? '2 2' : undefined}
      fill={unreliable ? 'transparent' : stroke}
    />
  );
}

export default function CftDecayChart({ grip, rows }: { grip: Grip; rows: BenchmarkRow[] }) {
  const [metric, setMetric] = useState<'average' | 'peak'>('average');

  const series: Series[] = useMemo(() => {
    const out: Series[] = [];
    for (const hand of HANDS) {
      for (const round of [1, 2] as const) {
        const row = rows.find((r) => r.grip === grip && r.hand === hand && r.test_round === round);
        if (!row) continue;
        const summary = summaryOf(row);
        if (!summary) continue;
        out.push({
          hand,
          round,
          color: HAND_COLOR[hand],
          opacity: round === 1 && rows.some((r) => r.hand === hand && r.test_round === 2) ? 0.35 : 1,
          criticalForce: row.critical_force,
          data: summary.reps.map((rep) => ({
            rep: rep.rep,
            value: metric === 'average' ? rep.average : rep.peak,
            unreliable: rep.unreliable,
          })),
          unreliableCount: summary.reps.filter((r) => r.unreliable).length,
          cfRatio: row.cf_ratio,
          thresholdZone: row.threshold_zone,
        });
      }
    }
    return out;
  }, [rows, grip, metric]);

  if (series.length === 0) {
    return (
      <div className="card text-sm text-slate-500">
        {GRIP_LABEL[grip]}: no CFT data uploaded yet.
      </div>
    );
  }

  const deltas = HANDS.map((hand) => {
    const r1 = series.find((s) => s.hand === hand && s.round === 1);
    const r2 = series.find((s) => s.hand === hand && s.round === 2);
    if (!r1?.criticalForce || !r2?.criticalForce) return null;
    const abs = r2.criticalForce - r1.criticalForce;
    const pct = (abs / r1.criticalForce) * 100;
    return { hand, abs, pct };
  }).filter((d): d is { hand: Hand; abs: number; pct: number } => d !== null);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{GRIP_LABEL[grip]} — force decay</h3>
        <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
          {(['average', 'peak'] as const).map((m) => (
            <button
              key={m}
              className={`px-3 py-1.5 font-semibold ${
                metric === m ? 'bg-slate-700 text-white' : 'text-slate-400'
              }`}
              onClick={() => setMetric(m)}
            >
              {m === 'average' ? 'Avg' : 'Peak'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="rep"
              type="number"
              domain={[1, 'dataMax']}
              allowDecimals={false}
              stroke="#64748b"
              fontSize={11}
              label={undefined}
            />
            <YAxis stroke="#64748b" fontSize={11} unit="" width={46} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
              formatter={(v: number) => [`${v?.toFixed?.(1)} kg`, metric]}
              labelFormatter={(rep) => `Rep ${rep}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {series.map((s) => (
              <Line
                key={`${s.hand}-${s.round}`}
                name={`${HAND_LABEL[s.hand]}${s.round === 2 ? ' (retest)' : ''}`}
                data={s.data}
                dataKey="value"
                stroke={s.color}
                strokeOpacity={s.opacity}
                strokeWidth={s.round === 2 ? 2.5 : 1.5}
                dot={<RepDot />}
                isAnimationActive={false}
                connectNulls
              />
            ))}
            {series.map(
              (s) =>
                s.criticalForce !== null && (
                  <ReferenceLine
                    key={`cf-${s.hand}-${s.round}`}
                    y={s.criticalForce}
                    stroke={s.color}
                    strokeOpacity={s.opacity * 0.9}
                    strokeDasharray="6 4"
                    label={{
                      value: `CF ${s.criticalForce.toFixed(1)}`,
                      fill: s.color,
                      fontSize: 10,
                      position: 'right',
                    }}
                  />
                ),
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 space-y-1 text-xs text-slate-400">
        {deltas.map((d) => (
          <p key={d.hand} className="font-semibold text-emerald-400">
            {HAND_LABEL[d.hand]} CF change: {d.abs >= 0 ? '+' : ''}
            {d.abs.toFixed(1)} kg ({d.pct >= 0 ? '+' : ''}
            {d.pct.toFixed(0)}%)
          </p>
        ))}
        {series.map((s) => (
          <p key={`meta-${s.hand}-${s.round}`}>
            {HAND_LABEL[s.hand]}
            {s.round === 2 ? ' (retest)' : ''}: CF ratio {s.cfRatio ?? '—'} · threshold zone{' '}
            {s.thresholdZone ?? '—'}
            {s.unreliableCount > 0 && ` · ${s.unreliableCount} unreliable rep(s) shown hollow`}
          </p>
        ))}
      </div>
    </div>
  );
}
