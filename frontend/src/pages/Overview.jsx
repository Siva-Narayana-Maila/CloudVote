import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

const SLIDES = [
  {
    eyebrow: 'Election room / 2025',
    title: 'A clearer way to be counted.',
    body: 'Ballotique gives your organization a private, simple moment to participate — then an auditable view of how every vote became a trusted outcome.',
    cta: { label: 'Enter voting room →', to: '/register' },
  },
  {
    eyebrow: 'Live & transparent',
    title: 'Results update as ballots are sealed.',
    body: 'Watch participation and tallies update in real time, without ever exposing an individual vote.',
    cta: { label: 'See live results →', to: '/results' },
  },
  {
    eyebrow: 'Proof, not promises',
    title: 'Every vote leaves a verifiable trace.',
    body: 'Your receipt lets you confirm your ballot is intact in the ledger — independently, any time.',
    cta: { label: 'Verify a receipt →', to: '/verify' },
  },
];

const TICKER_ITEMS = [
  'Your identity and your choice are always kept separate.',
  'Every ballot is sealed into a tamper-evident, hash-chained ledger.',
  'Results refresh live — no manual reload needed.',
  'MFA is required for every admin sign-in, every time.',
];

const TILES = [
  { icon: '🗳️', label: 'Cast Your Vote', to: '/vote' },
  { icon: '📊', label: 'Live Results', to: '/results' },
  { icon: '🔍', label: 'Verify a Receipt', to: '/verify' },
  { icon: '👤', label: 'Your Account', to: '/profile' },
  { icon: '📝', label: 'Create Account', to: '/register' },
  { icon: '🛡️', label: 'Admin Portal', to: '/admin/login' },
];

const STEPS = [
  { n: '01', title: 'Authenticate', body: 'Password + MFA verifies the person, then protects the session.' },
  { n: '02', title: 'Make a choice', body: 'One focused ballot. No clutter, no second-guessing.' },
  { n: '03', title: 'Seal the ballot', body: 'Your vote enters an append-only, tamper-proof ledger.' },
  { n: '04', title: 'See the signal', body: 'Results update live while voter privacy stays intact.' },
];

export default function Overview() {
  const [slide, setSlide] = useState(0);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Promise.all([api.getResults(), api.getLedgerIntegrity()])
      .then(([results, integrity]) => {
        setStats({
          votesCast: results.votesCast,
          participation: results.participation,
          integrity: integrity.integrityPercentage,
        });
      })
      .catch(() => {});
  }, []);

  const current = SLIDES[slide];

  return (
    <div id="main-content">
      <div className="ticker-wrap">
        <div className="ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i}>● {item}</span>
          ))}
        </div>
      </div>

      <div className={`hero-banner hero-banner-${slide}`}>
        <div className="shell" style={{ paddingBottom: 0 }}>
          <span className="eyebrow">
            <span className="status-dot" />
            {current.eyebrow}
          </span>

          <h1 style={{ fontSize: 44, marginTop: 20, maxWidth: 520, minHeight: 110 }}>
            {current.title}
          </h1>

          <div className="flourish" />

          <p style={{ marginTop: 16, maxWidth: 440, fontSize: 15, minHeight: 60 }}>
            {current.body}
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <Link to={current.cta.to} className="btn btn-primary">
              {current.cta.label}
            </Link>
            <Link to="/results" className="btn btn-secondary">
              Live results
            </Link>
          </div>

          <div className="carousel-dots">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                className={`carousel-dot ${i === slide ? 'active' : ''}`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="shell" style={{ paddingTop: 32 }}>
        <div
          style={{
            display: 'flex',
            gap: 20,
            paddingBottom: 20,
            borderBottom: '1px solid var(--color-border)',
            fontSize: 12,
            color: 'var(--color-ink-soft)',
          }}
        >
          <span>🔒 HTTPS encrypted</span>
          <span>✓ MFA protected</span>
          <span>📄 Append-only ledger</span>
        </div>

        {stats && (
          <div className="card stats-row" style={{ marginTop: 32, padding: 8 }}>
            <div className="stat-block">
              <p className="stat-number">{stats.votesCast.toLocaleString()}</p>
              <p className="stat-label">Votes Cast</p>
            </div>
            <div className="stat-block">
              <p className="stat-number">{stats.participation}%</p>
              <p className="stat-label">Participation</p>
            </div>
            <div className="stat-block">
              <p className="stat-number">{stats.integrity.toFixed(0)}%</p>
              <p className="stat-label">Ledger Integrity</p>
            </div>
          </div>
        )}

        <div style={{ marginTop: 48 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-teal-700)', marginBottom: 14 }}>
            QUICK LINKS
          </p>
          <div className="tile-grid">
            {TILES.map((t) => (
              <Link key={t.to} to={t.to} className="tile">
                <span className="tile-icon">{t.icon}</span>
                <span className="tile-label">{t.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: 32, padding: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-teal-700)', marginBottom: 8 }}>
            ONE ELECTION, END TO END
          </p>
          <h2 style={{ fontSize: 22, marginBottom: 20 }}>A calm path from identity to outcome.</h2>
          <div className="step-grid">
            {STEPS.map((s) => (
              <div key={s.n} className="step-card card">
                <p className="step-number">{s.n}</p>
                <p style={{ fontWeight: 600, color: 'var(--color-ink)', fontSize: 14, marginTop: 8, marginBottom: 6 }}>{s.title}</p>
                <p style={{ fontSize: 12.5 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: 24, marginBottom: 48, padding: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-teal-700)', marginBottom: 8 }}>
            THE PROMISE
          </p>
          <h2 style={{ fontSize: 22, marginBottom: 20 }}>Trust is something you can inspect.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            <Feature title="Private by design" body="JWT sessions, MFA, and a ballot flow that never ties your choice to your identity." />
            <Feature title="Proof after the vote" body="A tamper-evident receipt lets every participant verify inclusion without revealing intent." />
            <Feature title="Clarity for everyone" body="Live tallies and service health turn election day into a shared source of confidence." />
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ title, body }) {
  return (
    <div style={{ borderLeft: '2px solid var(--color-gold)', paddingLeft: 12 }}>
      <p style={{ fontWeight: 500, color: 'var(--color-ink)', fontSize: 14, marginBottom: 6 }}>{title}</p>
      <p style={{ fontSize: 13 }}>{body}</p>
    </div>
  );
}