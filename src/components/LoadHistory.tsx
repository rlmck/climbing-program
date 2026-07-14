import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BenchmarkRow, StrengthLoadRow } from '../lib/db';
import { GRIPS, GRIP_LABEL, type Grip } from '../domain/types';
import { roundHalfKg, formatKg } from '../domain/loads';

const GRIP_COLOR: Record<Grip, string> = { half_crimp: '#34d399', three_finger_drag: '#fbbf24' };

export function LoadHistoryChart({ loads }: { loads: StrengthLoadRow[] }) {
  const data = useMemo(() => {
    const byFortnight = new Map<number, Record<string, number>>();
    for (const l of loads) {
      const row = byFortnight.get(l.fortnight) ?? { fortnight: l.fortnight };
      row[l.grip] = roundHalfKg(l.load_kg);
      byFortnight.set(l.fortnight, row);
    }
    return [...byFortnight.values()].sort((a, b) => a.fortnight - b.fortnight);
  }, [loads]);

  if (data.length === 0) return null;

  return (
    <div className="card">
      <h3 className="font-semibold">Training load by fortnight (total, kg)</h3>
      <div className="mt-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="fortnight"
              stroke="#64748b"
              fontSize={11}
              tickFormatter={(f) => `F${f}`}
            />
            <YAxis stroke="#64748b" fontSize={11} domain={['dataMin - 2', 'dataMax + 2']} width={46} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
              labelFormatter={(f) => `Fortnight ${f} (weeks ${f * 2 - 1}–${f * 2})`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {GRIPS.map((grip) => (
              <Line
                key={grip}
                name={GRIP_LABEL[grip]}
                dataKey={grip}
                stroke={GRIP_COLOR[grip]}
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LoadHistoryList({ loads }: { loads: StrengthLoadRow[] }) {
  if (loads.length === 0) return null;
  const sorted = [...loads].sort((a, b) => a.fortnight - b.fortnight || a.grip.localeCompare(b.grip));
  return (
    <div className="card">
      <h3 className="font-semibold">Load decisions</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {sorted.map((l) => (
          <li key={l.id} className="flex items-start gap-2">
            <span
              className={`chip mt-0.5 ${
                l.fortnight === 1
                  ? 'bg-slate-800 text-slate-300'
                  : l.progressed
                    ? 'bg-emerald-900 text-emerald-300'
                    : 'bg-amber-900 text-amber-300'
              }`}
            >
              F{l.fortnight}
            </span>
            <span className="text-slate-300">
              {GRIP_LABEL[l.grip]}: <b>{formatKg(l.load_kg)}</b>{' '}
              {l.fortnight === 1 ? (
                <span className="text-slate-500">— baseline (90% of MVC)</span>
              ) : l.progressed ? (
                <span className="text-emerald-400">— progressed</span>
              ) : (
                <span className="text-amber-400">— held: {l.hold_reason ?? 'not clean'}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MvcComparison({ benchmarks }: { benchmarks: BenchmarkRow[] }) {
  const mvc = benchmarks.filter((b) => b.type === 'mvc');
  if (mvc.length === 0) return null;
  return (
    <div className="card">
      <h3 className="font-semibold">MVC (total load)</h3>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="py-1">Grip</th>
            <th>Baseline</th>
            <th>Retest</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {GRIPS.map((grip) => {
            const r1 = mvc.find((b) => b.grip === grip && b.test_round === 1)?.mvc_total_load_kg;
            const r2 = mvc.find((b) => b.grip === grip && b.test_round === 2)?.mvc_total_load_kg;
            return (
              <tr key={grip} className="border-t border-slate-800">
                <td className="py-1.5">{GRIP_LABEL[grip]}</td>
                <td>{r1 != null ? formatKg(r1) : '—'}</td>
                <td>{r2 != null ? formatKg(r2) : '—'}</td>
                <td className={r1 != null && r2 != null && r2 >= r1 ? 'text-emerald-400' : 'text-slate-400'}>
                  {r1 != null && r2 != null
                    ? `${r2 - r1 >= 0 ? '+' : ''}${formatKg(r2 - r1)} (${(((r2 - r1) / r1) * 100).toFixed(0)}%)`
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
