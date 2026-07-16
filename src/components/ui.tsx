import { useEffect, useRef } from 'react';
import { roundHalfKg } from '../domain/loads';
import { countUp } from '../lib/motion';

const STATUS_STYLE = {
  complete: { label: 'Complete', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  failed: { label: 'Failed', text: 'text-rose-300', dot: 'bg-rose-400' },
} as const;

/** Typographic status readout — mono small caps with a square indicator. */
export function StatusTag({ status }: { status: 'complete' | 'failed' }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.15em] ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-[1px] ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

function kgValue(kg: number): string {
  const r = roundHalfKg(kg);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * A weight readout: mono tabular digits counting up on mount, dimmed unit.
 * `prefix` renders a static sign ('+' / '−') ahead of the digits.
 */
export function Kg({ kg, prefix = '' }: { kg: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    countUp(ref.current, kg, kgValue);
  }, [kg]);
  return (
    <span className="font-mono tabular-nums">
      {prefix}
      <span ref={ref}>{kgValue(kg)}</span>
      <span className="ml-1 text-[0.7em] font-normal text-slate-500">kg</span>
    </span>
  );
}
