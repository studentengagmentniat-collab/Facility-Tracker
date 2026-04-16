import { useState } from 'react';
import { supabase } from './supabase';

export default function Auth() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('requester');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setLoading(false);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, role } } });
    if (error) { setErr(error.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from('profiles').upsert({ id: data.user.id, name, role, email });
      setMsg('Account created! You can now log in.');
      setMode('login');
    }
    setLoading(false);
  }

  const inputStyle = { width: '100%', padding: '9px 12px', fontSize: '14px', border: '1px solid #e0e0e0', borderRadius: '8px', marginTop: '4px', fontFamily: 'inherit', background: '#fff', color: '#111', outline: 'none' };
  const labelStyle = { fontSize: '13px', color: '#666', fontWeight: '500' };
  const btnStyle = { width: '100%', padding: '10px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', marginTop: '6px' };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px', border: '1px solid #e8e8e8' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '24px', fontWeight: '600', color: '#111' }}>Facility Tracker</div>
          <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</div>
        </div>

        {err && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{err}</div>}
        {msg && <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#16a34a', marginBottom: '12px' }}>{msg}</div>}

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
          {mode === 'register' && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Full Name</label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" required />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Role</label>
                <select style={inputStyle} value={role} onChange={e => setRole(e.target.value)}>
                  <option value="requester">Requester</option>
                  <option value="manager">Facility Manager</option>
                  <option value="finance">Finance</option>
                  <option value="facility">Facility Team</option>
                </select>
              </div>
            </>
          )}
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Password</label>
            <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button style={btnStyle} type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: '#666' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span style={{ color: '#1a73e8', cursor: 'pointer', fontWeight: '500' }} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); setMsg(''); }}>
            {mode === 'login' ? 'Register' : 'Sign In'}
          </span>
        </div>
      </div>
    </div>
  );
}
