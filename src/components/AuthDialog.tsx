import { useEffect, useState, type FormEvent } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../firebase';

type Props = { onClose: () => void };

function friendlyError(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === 'auth/email-already-in-use') return 'This email already has an account. Try signing in.';
    if (error.code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (error.code === 'auth/weak-password') return 'Use a password with at least six characters.';
    if (error.code === 'auth/invalid-credential') return 'Email or password not recognized.';
    if (error.code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
  }
  return 'We could not complete this request. Please try again.';
}

export default function AuthDialog({ onClose }: Props) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'sign-up') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!auth || !email) {
      setError('Enter your email address first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setNotice('If this address has an account, a reset email is on its way.');
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        <div className="dialog-symbol" aria-hidden="true">✦</div>
        <span className="eyebrow">STACK PLAYGROUND</span>
        <h2 id="auth-title">{mode === 'sign-up' ? 'Keep your progress' : 'Welcome back'}</h2>
        <p className="dialog-intro">{mode === 'sign-up' ? 'Create an account to save this run and continue it on another device.' : 'Sign in to pick up where you left off.'}</p>

        {auth ? (
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="auth-email">Email address</label>
            <input id="auth-email" type="email" required autoFocus autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            <label htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" minLength={6} required autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" />
            {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
            {notice ? <p className="form-message" role="status">{notice}</p> : null}
            <button className="button button--primary button--wide" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'} <span aria-hidden="true">→</span></button>
            {mode === 'sign-in' ? <button className="text-button" type="button" onClick={resetPassword} disabled={busy}>Forgot your password?</button> : null}
          </form>
        ) : (
          <div className="account-unavailable">Accounts are temporarily unavailable. You can still complete the lab as a guest.</div>
        )}

        {auth ? (
          <p className="dialog-switch">
            {mode === 'sign-up' ? 'Already have an account?' : 'New to the lab?'}{' '}
            <button type="button" onClick={() => { setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'); setError(''); setNotice(''); }}>{mode === 'sign-up' ? 'Sign in' : 'Create an account'}</button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
