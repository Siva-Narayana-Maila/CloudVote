import { useEffect, useState } from 'react';
import { api } from '../api/client';

function initials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function leaderLabel(leaders) {
  if (leaders.length === 0) return 'No votes cast';
  if (leaders.length === 1) return `🏆 ${leaders[0]}`;
  return `Tie: ${leaders.join(', ')}`;
}

export default function Archive() {
  const [elections, setElections] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getArchive()
      .then((data) => setElections(data.elections))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="shell" style={{ paddingTop: 48 }}>
      <span className="eyebrow">Public record</span>
      <h1 style={{ fontSize: 30, marginTop: 14 }}>Election archive</h1>
      <p style={{ marginTop: 8, fontSize: 13.5, maxWidth: 560 }}>
        Final results for every completed election. Only totals are shown — individual choices are
        never recorded against a voter.
      </p>

      {error && <div className="error-banner" style={{ marginTop: 24 }}>{error}</div>}
      {!elections && !error && <p style={{ marginTop: 24, fontSize: 13 }}>Loading…</p>}

      {elections && elections.length === 0 && (
        <div className="card" style={{ marginTop: 24, padding: '56px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗂️</div>
          <h3 style={{ marginBottom: 8 }}>No completed elections yet</h3>
          <p style={{ fontSize: 13.5 }}>Once an election closes, its final results will appear here.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 20, marginTop: 28 }}>
        {elections &&
          elections.map((e) => (
            <div key={e.id} className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 18 }}>{e.name}</h3>
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    Closed {new Date(e.closesAt).toLocaleDateString([], { dateStyle: 'medium' })}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--color-ink)', lineHeight: 1 }}>
                    {e.totalVotes.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }}>
                    votes cast
                  </p>
                </div>
              </div>

              <div
                style={{
                  margin: '16px 0',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'var(--color-surface-sunken)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--color-ink)',
                }}
              >
                {leaderLabel(e.leaders)}
              </div>

              {e.results.map((r) => {
                const color = r.color || '#16335c';
                return (
                  <div key={r.candidateId} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13.5, marginBottom: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        {r.photoUrl ? (
                          <img
                            src={r.photoUrl}
                            alt={r.name}
                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${color}` }}
                          />
                        ) : (
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: color,
                              color: '#fff',
                              fontSize: 9,
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {initials(r.name)}
                          </span>
                        )}
                        {r.symbol && <span>{r.symbol}</span>}
                        <span style={{ color: 'var(--color-ink)' }}>{r.name}</span>
                      </span>
                      <span style={{ fontWeight: 500, color: 'var(--color-ink)', flexShrink: 0 }}>
                        {r.votes} · {r.percentage}%
                      </span>
                    </div>
                    <div style={{ height: 8, background: 'var(--color-surface-sunken)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${r.percentage}%`, height: '100%', background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}