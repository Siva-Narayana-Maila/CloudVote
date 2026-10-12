import { useEffect, useState } from 'react';
import { api } from '../api/client';

const BADGES = {
  up: { label: 'Operational', bg: 'rgba(46, 143, 86, 0.14)', fg: '#2e8f56' },
  degraded: { label: 'Degraded', bg: 'rgba(201, 162, 39, 0.18)', fg: '#a07d0f' },
  down: { label: 'Down', bg: 'rgba(161, 58, 44, 0.12)', fg: '#a13a2c' },
};

const DESCRIPTIONS = {
  'API gateway': 'Single public entry point: routing, rate limiting, CORS',
  'Auth service': 'Registration, login, JWT sessions, MFA',
  'Voting service': 'Ballot casting, duplicate-vote prevention, hash-chained ledger writes',
  'Tally service': 'Live results, archive, ledger integrity and receipt verification',
  'PostgreSQL database': 'Users, elections, candidates and the append-only vote ledger',
};

export default function StatusPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await api.getStatus();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const operational = data?.overall === 'operational';

  return (
    <div className="shell" style={{ paddingTop: 48, maxWidth: 820 }}>
      <span className="eyebrow">System status</span>
      <h1 style={{ fontSize: 30, marginTop: 14 }}>Platform health</h1>
      <p style={{ marginTop: 8, fontSize: 13.5, maxWidth: 560 }}>
        Every row below is a live health check, run by the API gateway against that service each
        time this page refreshes.
      </p>

      {error && (
        <div className="error-banner" style={{ marginTop: 24 }}>
          Can't reach the platform right now: {error}
        </div>
      )}

      {data && (
        <>
          <div
            className="card"
            style={{
              marginTop: 24,
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderColor: operational ? 'rgba(46, 143, 86, 0.4)' : 'rgba(201, 162, 39, 0.5)',
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: operational ? '#2e8f56' : '#c9a227',
              }}
            />
            <strong style={{ color: 'var(--color-ink)', fontSize: 15 }}>
              {operational ? 'All systems operational' : 'Some systems are degraded'}
            </strong>
          </div>

          <div className="card" style={{ marginTop: 16, padding: '4px 22px' }}>
            {data.services.map((s, i) => {
              const badge = BADGES[s.status] || BADGES.down;
              return (
                <div
                  key={s.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                    padding: '16px 0',
                    borderBottom: i === data.services.length - 1 ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600, color: 'var(--color-ink)', fontSize: 14.5 }}>{s.name}</p>
                    <p style={{ fontSize: 12, marginTop: 2 }}>{DESCRIPTIONS[s.name]}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--color-ink-soft)' }}>
                      {s.latencyMs === null ? '—' : `${s.latencyMs} ms`}
                    </span>
                    <span
                      style={{
                        background: badge.bg,
                        color: badge.fg,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 12px',
                        borderRadius: 999,
                        minWidth: 92,
                        textAlign: 'center',
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ fontSize: 12, marginTop: 14 }}>
            Last checked {new Date(data.checkedAt).toLocaleTimeString()} · refreshes every 15 seconds
          </p>
        </>
      )}

      {!data && !error && <p style={{ marginTop: 24, fontSize: 13 }}>Checking services…</p>}
    </div>
  );
}