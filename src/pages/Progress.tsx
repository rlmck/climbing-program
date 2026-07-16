import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { getBenchmarks, getStrengthLoads } from '../lib/api';
import { riseIn } from '../lib/motion';
import type { BenchmarkRow, StrengthLoadRow } from '../lib/db';
import CftDecayChart from '../components/CftDecayChart';
import { LoadHistoryChart, LoadHistoryList, MvcComparison } from '../components/LoadHistory';
import { GRIPS } from '../domain/types';

export default function Progress() {
  const { athlete } = useAuth();
  const [benchmarks, setBenchmarks] = useState<BenchmarkRow[]>([]);
  const [loads, setLoads] = useState<StrengthLoadRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loaded) riseIn(listRef.current, ':scope > *');
  }, [loaded]);

  useEffect(() => {
    if (!athlete) return;
    void Promise.all([getBenchmarks(athlete.id), getStrengthLoads(athlete.id)]).then(([b, l]) => {
      setBenchmarks(b);
      setLoads(l);
      setLoaded(true);
    });
  }, [athlete]);

  if (!athlete) return null;
  if (loaded && benchmarks.length === 0) {
    return (
      <div className="card text-sm text-slate-400">
        No benchmark data yet.{' '}
        <Link to="/onboarding" className="text-emerald-400 underline">
          Run your benchmark
        </Link>{' '}
        to generate loads and graphs.
      </div>
    );
  }

  const cft = benchmarks.filter((b) => b.type === 'cft');

  return (
    <div ref={listRef} className="space-y-4">
      <h1 className="text-xl font-bold">Progress</h1>
      {GRIPS.map((grip) => (
        <CftDecayChart key={grip} grip={grip} rows={cft.filter((b) => b.grip === grip)} />
      ))}
      <MvcComparison benchmarks={benchmarks} />
      <LoadHistoryChart loads={loads} />
      <LoadHistoryList loads={loads} />
    </div>
  );
}
