import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { BrandMark } from '../components/Layout';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setBusy(false);
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Back to this exact app URL (works on GitHub Pages' subpath and localhost);
    // the recovery token arrives in the hash and supabase-js picks it up.
    const redirectTo = window.location.origin + window.location.pathname;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (err) setError(err.message);
    else setResetSent(true);
    setBusy(false);
  }

  if (forgotMode) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
        <h1 className="text-2xl font-bold">Reset password</h1>
        <p className="mt-1 text-sm text-slate-400">
          Enter your account email and we&apos;ll send you a reset link.
        </p>
        {resetSent ? (
          <div className="card mt-6 text-sm">
            <p className="text-emerald-400">
              ✓ If an account exists for {email}, a reset link is on its way. Open it on this
              device and you&apos;ll be asked for a new password.
            </p>
            <button
              className="btn-secondary mt-4 w-full"
              onClick={() => {
                setForgotMode(false);
                setResetSent(false);
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={sendReset} className="card mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              className="w-full text-center text-sm text-slate-400 underline"
              onClick={() => {
                setForgotMode(false);
                setError(null);
              }}
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="flex flex-col items-center text-center">
        <BrandMark className="h-16 w-16" />
        <h1 className="mt-4 text-3xl font-bold">Climbing Program</h1>
        <p className="mt-1 text-sm text-slate-400">13 weeks. Two grips. One route to the send.</p>
      </div>
      <form onSubmit={submit} className="card mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button"
          className="w-full text-center text-sm text-slate-400 underline"
          onClick={() => {
            setForgotMode(true);
            setError(null);
          }}
        >
          Forgot password?
        </button>
      </form>
    </div>
  );
}
