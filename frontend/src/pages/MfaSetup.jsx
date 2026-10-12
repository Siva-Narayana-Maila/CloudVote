import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';

export default function MfaSetup() {
  const navigate = useNavigate();
  const [qrCode, setQrCode] = useState(null);
  const [manualKey, setManualKey] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!api.getToken()) {
      navigate('/register');
      return;
    }
    api
      .mfaSetup()
      .then((data) => {
        setQrCode(data.qrCode);
        setManualKey(data.manualEntryKey);
      })
      .catch((err) => setError(err.message));
  }, [navigate]);

  async function handleConfirm(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.mfaConfirmSetup(code);
      setConfirmed(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) {
    return (
      <div className="shell" style={{ paddingTop: 64, textAlign: 'center' }}>
        <span className="eyebrow">Two-factor enabled</span>
        <h2 style={{ fontSize: 26, marginTop: 16 }}>You're all set.</h2>
        <p style={{ marginTop: 8, fontSize: 13.5, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
          Every future sign-in will now ask for a code from your authenticator app, in addition
          to your password.
        </p>
        <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => navigate('/vote')}>
          Go to voting room →
        </button>
      </div>
    );
  }

  return (
    <div className="shell" style={{ display: 'flex', justifyContent: 'center', paddingTop: 56 }}>
            <div className="card" style={{ padding: 32, width: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Logo size={40} wordmarkSize={20} />
        </div>
        <span className="eyebrow">Step 2 of 2</span>
        <h2 style={{ fontSize: 22, marginTop: 16 }}>Set up two-factor authentication.</h2>
        <p style={{ marginTop: 8, fontSize: 13.5 }}>
          Scan this code with an authenticator app (Google Authenticator, Authy, 1Password),
          then enter the 6-digit code it generates.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
          {qrCode ? (
            <img src={qrCode} alt="MFA QR code" style={{ width: 180, height: 180, borderRadius: 12, border: '1px solid var(--color-border)' }} />
          ) : (
            <div style={{ width: 180, height: 180, background: 'var(--color-surface-sunken)', borderRadius: 12 }} />
          )}
        </div>

        {manualKey && (
          <p style={{ fontSize: 11.5, textAlign: 'center', marginBottom: 20 }}>
            Can't scan it? Enter this key manually: <span className="mono">{manualKey}</span>
          </p>
        )}

        <form onSubmit={handleConfirm}>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6 }}>
            6-digit code
          </label>
          <input
            inputMode="numeric"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              fontSize: 16,
              letterSpacing: 4,
              fontFamily: 'var(--font-mono)',
              background: 'var(--color-surface-sunken)',
              marginBottom: 16,
            }}
          />

          {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Confirming…' : 'Confirm and enable →'}
          </button>
        </form>
      </div>
    </div>
  );
}
