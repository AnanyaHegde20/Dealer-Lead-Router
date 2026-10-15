import { useState, type FormEvent } from 'react';
import { signIn } from '../lib/auth';
import { ZapIcon } from '../components/icons';

/**
 * Full-page sign-in gate shown ONLY when Firebase is configured and no
 * user is signed in. Lead data lives in Firestore, so every route stays
 * behind this screen until authentication succeeds.
 */
export function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(trimmedEmail, password);
      // On success the auth listener in App re-renders the real app shell.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500 text-slate-950">
            <ZapIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">PURE Energy</p>
            <p className="text-xs text-slate-400">Dealer Lead Router</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8"
          noValidate
        >
          <div>
            <h1 className="text-lg font-semibold text-white">Sign in</h1>
            <p className="mt-1 text-sm text-slate-400">
              Lead data is stored in Cloud Firestore and is only available to
              signed-in team members.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-700/50 bg-rose-950/60 px-3 py-2 text-sm text-rose-300"
            >
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="signin-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Email
            </label>
            <input
              id="signin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white shadow-sm transition placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="signin-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Password
            </label>
            <input
              id="signin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white shadow-sm transition placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Accounts are managed by the project owner — contact your
          administrator if you need access.
        </p>
      </div>
    </div>
  );
}
