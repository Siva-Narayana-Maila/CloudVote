import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Vote() {
  const navigate = useNavigate();
  const [election, setElection] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState('');

  const isSignedIn = Boolean(api.getToken());

  useEffect(() => {
    api.getElection().then(setElection).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!election) return;
    const tick = () => {
      const diff = new Date(election.closesAt).getTime() - Date.now();
      if (diff <= 0) return setCountdown('Closed');
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${d}d ${h}h ${m}m`);
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [election]);

  async function handleCastVote() {
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      const receipt = await api.castVote(selected);
      navigate('/receipt', { state: { receipt } });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isSignedIn) {
    return (
      <div className="shell" style={{ paddingTop: 64, textAlign: 'center' }}>
        <p style={{ marginBottom: 16 }}>You'll need an account before you can cast a ballot.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <a href="/signin" className="btn btn-primary">Sign in →</a>
          <a href="/register" className="btn btn-secondary">Create account</a>
        </div>
      </div>
    );
  }

  if (error && !election) {
    return (
      <div className="shell" style={{ paddingTop: 64, textAlign: 'center' }}>
        <div className="error-banner" style={{ display: 'inline-block' }}>{error}</div>
      </div>
    );
  }

  if (!election) {
    return <div className="shell" style={{ paddingTop: 64, textAlign: 'center' }}>Loading election…</div>;
  }

  return (
    <div className="shell" style={{ paddingTop: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span className="eyebrow">{election.isOpen ? 'Voting open' : 'Voting closed'}</span>
          <h1 style={{ fontSize: 28, marginTop: 14 }}>{election.name}</h1>
          <p style={{ marginTop: 10, maxWidth: 420, fontSize: 13.5 }}>
            Choose one candidate. Your selection is private and cannot be changed after submission.
          </p>
        </div>
        {election.isOpen && (
          <div className="card" style={{ padding: '12px 18px', textAlign: 'right' }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase' }}>Closes in</p>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-teal-900)' }}>{countdown}</p>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 32 }}>
        {election.candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            disabled={!election.isOpen}
            className="card"
            style={{
              padding: 20,
              textAlign: 'left',
              cursor: election.isOpen ? 'pointer' : 'not-allowed',
              opacity: election.isOpen ? 1 : 0.6,
              border: selected === c.id ? `2px solid ${c.color || 'var(--color-teal-700)'}` : '1px solid var(--color-border)',
            }}
          >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {c.photo_url ? (
                <img
                  src={c.photo_url}
                  alt={c.name}
                  style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${c.color || 'var(--color-teal-700)'}` }}
                />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: c.color || 'var(--color-teal-700)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {c.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
              )}
              {c.symbol && <span style={{ fontSize: 24 }}>{c.symbol}</span>}
            </div>
            <p style={{ fontWeight: 600, color: 'var(--color-ink)', fontSize: 14.5 }}>{c.name}</p>
            <p style={{ fontSize: 12.5, color: c.color || 'var(--color-teal-700)', fontWeight: 500, marginTop: 2 }}>{c.role}</p>
            <p style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>{c.bio}</p>
          </button>
        ))}
      </div>

      {election.isOpen && (
        <div
          className="card"
          style={{ marginTop: 24, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <p style={{ fontSize: 13, color: 'var(--color-ink)' }}>
            🔗 Private ballot protocol — your identity and choice are separated before the vote enters the ledger.
          </p>
          <button className="btn btn-primary" disabled={!selected || submitting} onClick={handleCastVote}>
            {submitting ? 'Sealing ballot…' : 'Cast my vote →'}
          </button>
        </div>
      )}

      {error && <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>}
    </div>
  );
}