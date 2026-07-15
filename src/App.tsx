import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Onboarding from './pages/Onboarding';
import WeekBoard from './pages/WeekBoard';
import StrengthSession from './pages/StrengthSession';
import Progress from './pages/Progress';
import CoachDashboard from './pages/CoachDashboard';
import CoachAthlete from './pages/CoachAthlete';

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>
  );
}

export default function App() {
  const { loading, session, athlete, passwordRecovery, clearPasswordRecovery } = useAuth();

  if (loading) return <Spinner />;
  if (session && passwordRecovery) return <ResetPassword onDone={clearPasswordRecovery} />;
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  if (!athlete) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="card mt-12">
          <h1 className="text-lg font-bold">No athlete profile</h1>
          <p className="mt-2 text-sm text-slate-400">
            You are signed in, but no athlete row is linked to this account. Run the seed SQL
            (supabase/seed.sql) with this account&apos;s email, then reload.
          </p>
        </div>
      </div>
    );
  }

  const home = athlete.is_athlete
    ? athlete.program_start_date
      ? '/week'
      : '/onboarding'
    : '/coach';

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/onboarding" element={<Onboarding round={1} />} />
        <Route path="/retest" element={<Onboarding round={2} />} />
        <Route path="/week" element={<WeekBoard />} />
        <Route path="/session/:sessionId" element={<StrengthSession />} />
        <Route path="/progress" element={<Progress />} />
        {athlete.is_coach && <Route path="/coach" element={<CoachDashboard />} />}
        {athlete.is_coach && <Route path="/coach/:athleteId" element={<CoachAthlete />} />}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
