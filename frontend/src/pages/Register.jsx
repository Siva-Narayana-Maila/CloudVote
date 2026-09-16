import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.register(email, password);
      // Fresh account has no MFA yet, so /login returns a full session
      // token directly — that token is what authorizes the MFA-setup step.
      const loginResult = await api.login(email, password);
      api.setToken(loginResult.token);
      navigate('/mfa-setup');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell" style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}>
      <div className="card" style={{ padding: 32, width: 400 }}>
        <span className="eyebrow">Member access</span>
        <h2 style={{ fontSize: 24, marginTop: 16 }}>Create your account.</h2>
        <p style={{ marginTop: 8, fontSize: 13.5 }}>
          Right after this, we'll set up two-factor authentication to keep your ballot secure.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Work email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.co"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              style={inputStyle}
            />
          </div>

          {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Creating account…' : 'Create account →'}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 12.5, textAlign: 'center' }}>
          Already registered? <Link to="/signin" style={{ color: 'var(--color-teal-700)', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6, color: 'var(--color-ink)' };
const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  background: 'var(--color-surface-sunken)',
};
