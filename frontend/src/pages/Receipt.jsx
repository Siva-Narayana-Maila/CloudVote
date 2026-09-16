import { useLocation, Navigate, Link } from 'react-router-dom';

export default function Receipt() {
  const { state } = useLocation();
  const receipt = state?.receipt;

  // Someone landing here directly (refresh, bookmarked URL) has no receipt
  // in memory — send them back rather than show a broken confirmation.
  if (!receipt) return <Navigate to="/vote" replace />;

  return (
    <div className="shell" style={{ paddingTop: 56, textAlign: 'center' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-teal-700)',
          color: '#fff',
          fontSize: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto',
        }}
      >
        ✓
      </div>
      <span className="eyebrow" style={{ marginTop: 16 }}>Vote recorded</span>
      <h1 style={{ fontSize: 30, marginTop: 14 }}>Your voice is in the ledger.</h1>
      <p style={{ marginTop: 10, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', fontSize: 13.5 }}>
        Your ballot was encrypted, separated from your identity, and added to the append-only
        vote ledger. Keep this receipt to verify inclusion later.
      </p>

      <div className="card" style={{ marginTop: 28, padding: 24, textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Northstar Cooperative election</span>
          <span className="eyebrow" style={{ background: '#e6f0ea', color: 'var(--color-teal-700)' }}>Verified</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ReceiptField label="Receipt ID" value={receipt.receiptId} />
          <ReceiptField label="Timestamp" value={new Date(receipt.castAt).toLocaleString()} />
          <ReceiptField label="Ledger position" value={`#${receipt.ledgerPosition}`} />
          <ReceiptField label="Commitment hash" value={`sha256: ${receipt.commitmentHash.slice(0, 12)}…`} />
        </div>

        <p style={{ marginTop: 18, fontSize: 12, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
          🛡️ The ledger confirms inclusion, not your candidate choice. This is how we protect
          both transparency and privacy.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        <Link to="/results" className="btn btn-primary">See live results</Link>
        <Link to="/" className="btn btn-secondary">Return to overview</Link>
      </div>
            <p style={{ marginTop: 16, fontSize: 12 }}>
        <Link to="/verify" style={{ color: 'var(--color-teal-700)', fontWeight: 500 }}>
          Verify this receipt independently →
        </Link>
      </p>
    </div>
    
  );
}

function ReceiptField({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</p>
      <p className="mono" style={{ color: 'var(--color-ink)' }}>{value}</p>
    </div>
  );
}
