import { useEffect, useState } from 'react';
import { api } from '../api/client';



export default function Results() {
  const [results, setResults] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [error, setError] = useState(null);

    useEffect(() => {
    // Ledger integrity has no SSE endpoint (it rarely changes) — poll it
    // occasionally, separately from the live results stream.
    api.getLedgerIntegrity().then(setIntegrity).catch(() => {});
    const integrityInterval = setInterval(() => {
      api.getLedgerIntegrity().then(setIntegrity).catch(() => {});
    }, 15000);

    // Live results now stream over SSE instead of being polled.
    const source = new EventSource('/api/results/stream');
    source.onmessage = (event) => {
      setResults(JSON.parse(event.data));
      setError(null);
    };
    source.onerror = () => {
      setError('Live connection interrupted — results may be delayed.');
    };

    return () => {
      source.close();
      clearInterval(integrityInterval);
    };
  }, []);
  
  return (
    <div className="shell" style={{ paddingTop: 48 }}>
      <span className="eyebrow">
        <span className="status-dot" />
        Live tally · {results ? `updated ${timeAgo(results.updatedAt)}` : 'loading…'}
      </span>
      <h1 style={{ fontSize: 28, marginTop: 14 }}>A transparent signal.</h1>
      <p style={{ marginTop: 8, fontSize: 13.5, maxWidth: 460 }}>
        Results are visible as ballots are sealed. Individual choices remain private; the count
        remains open.
      </p>

      {error && <div className="error-banner" style={{ marginTop: 20 }}>{error}</div>}

      {results && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 28 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Voters cast</p>
                <p style={{ fontSize: 32, fontFamily: 'var(--font-display)', color: 'var(--color-teal-900)' }}>
                  {results.votesCast.toLocaleString()}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Participation</p>
                <p style={{ fontSize: 20, color: 'var(--color-gold)', fontWeight: 600 }}>{results.participation}%</p>
              </div>
            </div>

            {results.results.map((r) => (
              <CandidateRow key={r.candidateId} r={r} />
            ))}
          </div>

          <div className="card" style={{ padding: 24, background: 'var(--color-teal-900)', color: '#fff' }}>
            <p style={{ fontSize: 11, textTransform: 'uppercase', color: '#a9c4ba', marginBottom: 6 }}>
              Ledger integrity
            </p>
            <p style={{ fontSize: 30, fontFamily: 'var(--font-display)', color: '#fff' }}>
              {integrity ? integrity.integrityPercentage.toFixed(2) : '—'}%
            </p>
            <p style={{ fontSize: 12, color: '#c7dcd3', marginTop: 6 }}>
              Every recorded ballot is accounted for in the append-only chain.
            </p>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.15)', fontSize: 12, color: '#c7dcd3' }}>
              <Row label="Blocks committed" value={integrity?.blocksCommitted ?? '—'} />
              <Row
                label="Last checkpoint"
                value={integrity?.lastCheckpoint ? timeAgo(integrity.lastCheckpoint) : '—'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidateRow({ r }) {
  const color = r.color || 'var(--color-teal-700)';
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
            }}
          />
          {r.symbol && <span style={{ fontSize: 14 }}>{r.symbol}</span>}
          {r.name}
        </span>
        <span style={{ fontWeight: 500 }}>
          {r.votes} votes · {r.percentage}%
        </span>
      </div>
      <div style={{ height: 8, background: 'var(--color-surface-sunken)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${r.percentage}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}
