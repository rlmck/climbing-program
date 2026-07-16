import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

function navClass({ isActive }: { isActive: boolean }): string {
  return `flex-1 rounded-xl px-3 py-2 text-center font-display text-sm font-semibold transition-colors ${
    isActive
      ? 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-950/60'
      : 'text-slate-400 hover:text-slate-200'
  }`;
}

/** The app mark — the same twin peaks + bolt line as the install icon. */
export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={`${className} shrink-0`} aria-hidden="true">
      <path d="M118 408 L268 156 L342 280 L398 408 Z" fill="#10b981" opacity="0.55" />
      <path d="M56 408 L196 200 L262 300 L316 408 Z" fill="#34d399" />
      <path
        d="M120 396 C 200 352 160 288 226 246 C 268 220 300 180 308 128"
        fill="none"
        stroke="#e7edf6"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray="0.1 52"
      />
      <circle cx="312" cy="112" r="24" fill="#e7edf6" />
      <circle cx="312" cy="112" r="11" fill="#10b981" />
    </svg>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { athlete, coachView, setCoachView, signOut } = useAuth();
  const navigate = useNavigate();
  if (!athlete) return <>{children}</>;

  const dual = athlete.is_coach && athlete.is_athlete;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div>
            <div className="font-display text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
              Climbing Program
            </div>
            <div className="font-display font-bold leading-tight">{athlete.name}</div>
          </div>
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

      <main className="flex-1 px-4 pb-28 pt-2">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-3xl px-3 pb-2">
          <div className="flex gap-1 rounded-2xl border border-white/[0.08] bg-slate-950/85 p-1.5 shadow-xl shadow-black/50 backdrop-blur-md">
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
        </div>
      </nav>
    </div>
  );
}
