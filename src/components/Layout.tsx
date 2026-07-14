import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

function navClass({ isActive }: { isActive: boolean }): string {
  return `flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors ${
    isActive ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
  }`;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { athlete, coachView, setCoachView, signOut } = useAuth();
  const navigate = useNavigate();
  if (!athlete) return <>{children}</>;

  const dual = athlete.is_coach && athlete.is_athlete;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500">Climbing Program</div>
          <div className="font-bold">{athlete.name}</div>
        </div>
        <div className="flex items-center gap-2">
          {dual && (
            <button
              className="btn-secondary !px-3 !py-1.5 text-xs"
              onClick={() => {
                const next = !coachView;
                setCoachView(next);
                navigate(next ? '/coach' : '/week');
              }}
            >
              {coachView ? '→ My training' : '→ Coach view'}
            </button>
          )}
          <button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-2">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-1 p-2">
          {athlete.is_athlete && (
            <>
              <NavLink to="/week" className={navClass}>
                This week
              </NavLink>
              <NavLink to="/progress" className={navClass}>
                Progress
              </NavLink>
            </>
          )}
          {athlete.is_coach && (
            <NavLink to="/coach" className={navClass}>
              Coach
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  );
}
