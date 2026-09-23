import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';

const STAGE = { CREDENTIALS: 'credentials', MFA: 'mfa' };

export default function AdminLogin() {
  const navigate = useNavigate();
  const [stage, setStage] = useState(STAGE.CREDENTIALS);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [preAuthToken, setPreAuthToken] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.login(email, password);
      if (result.mfaRequired) {
        setPreAuthToken(result.preAuthToken);
        setStage(STAGE.MFA);
      } else {
        // A token issued without MFA never carries admin rights — see
        // auth-service. Send them to set up MFA instead of the dashboard.
        setError('MFA is required for admin access. Set it up, then sign in again.');
        navigate('/mfa-setup');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.mfaVerify(preAuthToken, code);
      api.setAdminToken(result.token);
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell" style={{ display: 'flex', justifyContent: 'center', paddingTop: 64 }}>
      <div className="card" style={{ padding: 32, width: 400 }}>
        <span className="eyebrow">Admin access</span>

        {stage === STAGE.CREDENTIALS ? (
          <>
            <h2 style={{ fontSize: 24, marginTop: 16 }}>Admin sign in.</h2>
            <p style={{ marginTop: 8, fontSize: 13.5 }}>
              Admin accounts always require a verification code, every time.
            </p>
            <form onSubmit={handleCredentials} style={{ marginTop: 24 }}>
              <Field label="Admin email">
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Password">
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              </Field>
              {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Checking…' : 'Continue →'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 24, marginTop: 16 }}>Enter your verification code.</h2>
            <p style={{ marginTop: 8, fontSize: 13.5 }}>Required for every admin sign-in.</p>
            <form onSubmit={handleMfa} style={{ marginTop: 24 }}>
              <Field label="Verification code">
                <input inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" style={{ ...inputStyle, letterSpacing: 4, fontFamily: 'var(--font-mono)' }} />
              </Field>
              {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Verifying…' : 'Verify and enter dashboard →'}
              </button>
            </form>
          </>
        )}

        <p style={{ marginTop: 18, fontSize: 11.5, textAlign: 'center' }}>
          <Link to="/signin" style={{ color: 'var(--color-teal-700)' }}>Not an admin? Voter sign in →</Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6, color: 'var(--color-ink)' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  background: 'var(--color-surface-sunken)',
};