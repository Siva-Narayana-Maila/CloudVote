import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
];

const STRENGTH_LABELS = ['', 'Weak', 'Okay', 'Strong'];
const STRENGTH_COLORS = ['var(--color-border)', 'var(--color-danger)', 'var(--color-gold)', '#2e8f56'];

export default function Register() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const passedRules = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const passwordOk = passedRules === PASSWORD_RULES.length;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit =
    fullName.trim().length > 1 && email.includes('@') && passwordOk && passwordsMatch && agreed;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!passwordOk) return setError('Your password does not meet all the requirements below.');
    if (!passwordsMatch) return setError('The two passwords do not match.');
    if (!agreed) return setError('Please accept the terms to continue.');

    setLoading(true);
    try {
      await api.register(fullName.trim(), email, password);
      // A fresh account has no MFA yet, so /login returns a session token
      // directly — that token authorizes the MFA-setup step that follows.
      const loginResult = await api.login(email, password);
      api.setToken(loginResult.token);
      navigate('/mfa-setup');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const passwordType = showPassword ? 'text' : 'password';

  return (
    <div className="shell" style={{ display: 'flex', justifyContent: 'center', paddingTop: 56 }}>
      <div className="card" style={{ padding: 32, width: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Logo size={40} wordmarkSize={20} />
        </div>
        <span className="eyebrow">Member access</span>
        <h2 style={{ fontSize: 24, marginTop: 16 }}>Create your account.</h2>
        <p style={{ marginTop: 8, fontSize: 13.5 }}>
          Right after this, we'll set up two-factor authentication to keep your ballot secure.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
          <Field label="Full name">
            <input
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              style={inputStyle}
            />
          </Field>

          <Field label="Work email">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your work email"
              style={inputStyle}
            />
          </Field>

          <Field
            label="Password"
            action={
              <button type="button" onClick={() => setShowPassword((s) => !s)} style={linkButtonStyle}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            }
          >
            <input
              type={passwordType}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              style={inputStyle}
            />
          </Field>

          {password.length > 0 && (
            <div style={{ margin: '-6px 0 16px' }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {PASSWORD_RULES.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      background: i < passedRules ? STRENGTH_COLORS[passedRules] : 'var(--color-border)',
                      transition: 'background 0.2s ease',
                    }}
                  />
                ))}
              </div>
              <p style={{ fontSize: 11.5, marginBottom: 6 }}>
                Password strength: <strong style={{ color: 'var(--color-ink)' }}>{STRENGTH_LABELS[passedRules] || 'Too short'}</strong>
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 11.5 }}>
                {PASSWORD_RULES.map((r) => {
                  const ok = r.test(password);
                  return (
                    <li key={r.label} style={{ color: ok ? '#2e8f56' : 'var(--color-ink-soft)', marginBottom: 2 }}>
                      {ok ? '✓' : '○'} {r.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <Field label="Confirm password">
            <input
              type={passwordType}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              style={{
                ...inputStyle,
                borderColor:
                  confirmPassword.length === 0
                    ? 'var(--color-border)'
                    : passwordsMatch
                    ? '#2e8f56'
                    : 'var(--color-danger)',
              }}
            />
            {confirmPassword.length > 0 && (
              <p style={{ fontSize: 11.5, marginTop: 6, color: passwordsMatch ? '#2e8f56' : 'var(--color-danger)' }}>
                {passwordsMatch ? '✓ Passwords match' : "Passwords don't match yet"}
              </p>
            )}
          </Field>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 12.5,
              lineHeight: 1.5,
              marginTop: 4,
              marginBottom: 18,
              cursor: 'pointer',
              color: 'var(--color-ink-soft)',
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              I confirm I'm eligible to vote in this election and I agree to Ballotique's terms of use
              and privacy policy.
            </span>
          </label>

          {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !canSubmit}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loading ? 'Creating account…' : 'Create account →'}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 12.5, textAlign: 'center' }}>
          Already registered?{' '}
          <Link to="/signin" style={{ color: 'var(--color-teal-700)', fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, action, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-ink)' }}>{label}</label>
        {action}
      </div>
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
  color: 'var(--color-ink)',
};

const linkButtonStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--color-teal-700)',
  cursor: 'pointer',
};