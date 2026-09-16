import { Link } from 'react-router-dom';

export default function Overview() {
  return (
    <div className="shell" style={{ paddingTop: 56 }}>
      <span className="eyebrow">
        <span className="status-dot" />
        Election room / 2025
      </span>

      <h1 style={{ fontSize: 44, marginTop: 20, maxWidth: 460 }}>
        A clearer way to be counted.
      </h1>

      <p style={{ marginTop: 16, maxWidth: 420, fontSize: 15 }}>
        CloudVote gives your organization a private, simple moment to participate — then an
        auditable view of how every vote became a trusted outcome.
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
        <Link to="/register" className="btn btn-primary">
          Enter voting room →
        </Link>
        <Link to="/results" className="btn btn-secondary">
          Live results
        </Link>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 20,
          marginTop: 36,
          paddingTop: 20,
          borderTop: '1px solid var(--color-border)',
          fontSize: 12,
          color: 'var(--color-ink-soft)',
        }}
      >
        <span>🔒 HTTPS encrypted</span>
        <span>✓ MFA protected</span>
        <span>📄 Append-only ledger</span>
      </div>

      <div className="card" style={{ marginTop: 48, padding: 24 }}>
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
