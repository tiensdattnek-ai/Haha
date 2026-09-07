import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';

export default function AuthGate() {
  const { register, login, accounts, booting } = useStore();
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accounts.length) setTab('register');
  }, [accounts.length]);

  const submit = async (e) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (tab === 'register') {
        if (password !== confirm) throw new Error('The two passwords do not match.');
        await register(username, password, remember);
      } else {
        await login(username, password, remember);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (booting) {
    return (
      <div className="auth">
        <div className="auth-grid" />
        <div className="row" style={{ color: 'var(--text-3)', fontSize: 13 }}>
          <span className="spinner" /> opening local vault…
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth-grid" />
      <motion.form
        className="auth-card"
        onSubmit={submit}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.9, 0.3, 1] }}
      >
        <div className="auth-mark">A</div>
        <h1>ATLAS</h1>
        <p className="sub">
          A research assistant whose model was trained from scratch on this machine.<br />
          Your account and every conversation stay in this browser.
        </p>

        <div className="auth-tabs">
          <button type="button" className={tab === 'login' ? 'on' : ''} onClick={() => { setTab('login'); setError(null); }}>Sign in</button>
          <button type="button" className={tab === 'register' ? 'on' : ''} onClick={() => { setTab('register'); setError(null); }}>Create account</button>
        </div>

        <div className="field">
          <label htmlFor="u">Username</label>
          <input id="u" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your name" />
        </div>
        <div className="field">
          <label htmlFor="p">Password</label>
          <input id="p" type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 6 characters" />
        </div>
        {tab === 'register' && (
          <div className="field">
            <label htmlFor="c">Confirm password</label>
            <input id="c" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="type it again" />
          </div>
        )}

        <div className="toggle-row" style={{ marginBottom: 16 }}>
          <span className="small muted">Stay signed in on this device</span>
          <div className={`switch ${remember ? 'on' : ''}`} onClick={() => setRemember((r) => !r)} />
        </div>

        {error && <div className="field"><div className="err">{error}</div></div>}

        <button className="btn solid full" type="submit" disabled={busy || !username || !password}>
          {busy ? <Loader2 size={15} className="spin" /> : <ArrowRight size={15} />}
          {tab === 'register' ? 'Create account' : 'Sign in'}
        </button>

        {tab === 'login' && accounts.length > 0 && (
          <div className="auth-accounts">
            {accounts.slice(0, 5).map((a) => (
              <button key={a.id} type="button" onClick={() => setUsername(a.username)}>{a.username}</button>
            ))}
          </div>
        )}

        <div className="auth-foot">
          <ShieldCheck size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
          Passwords are never stored or transmitted. Only a PBKDF2-SHA256 verifier (210,000 iterations, per-account random salt)
          is written to IndexedDB, and it never leaves this browser. Clearing site data erases the account permanently — there is
          no recovery, because there is no server holding a copy.
        </div>
      </motion.form>
    </div>
  );
}
