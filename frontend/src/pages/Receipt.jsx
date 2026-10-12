import { useEffect, useState } from 'react';
import { useLocation, Navigate, Link } from 'react-router-dom';
import QRCode from 'qrcode';

export default function Receipt() {
  const { state } = useLocation();
  const receipt = state?.receipt;
  const [qr, setQr] = useState(null);

  // The QR code encodes a link to the public verification page with this
  // receipt pre-filled, so "prove my vote was counted" is one scan.
  useEffect(() => {
    if (!receipt) return;
    const url = `${window.location.origin}/verify?receipt=${encodeURIComponent(receipt.receiptId)}`;
    QRCode.toDataURL(url, { width: 180, margin: 1, color: { dark: '#0b1f3a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [receipt]);

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

      <div className="card" style={{ marginTop: 28, padding: 24, textAlign: 'left', maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Election receipt</span>
          <span className="eyebrow" style={{ background: 'rgba(46, 143, 86, 0.14)', color: '#2e8f56' }}>Verified</span>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ReceiptField label="Receipt ID" value={receipt.receiptId} />
            <ReceiptField label="Timestamp" value={new Date(receipt.castAt).toLocaleString()} />
            <ReceiptField label="Ledger position" value={`#${receipt.ledgerPosition}`} />
            <ReceiptField label="Commitment hash" value={`sha256: ${receipt.commitmentHash.slice(0, 12)}…`} />
          </div>

          {qr && (
            <div style={{ textAlign: 'center' }}>
              <img
                src={qr}
                alt="QR code that opens this receipt's verification page"
                style={{ width: 150, height: 150, borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff' }}
              />
              <p style={{ fontSize: 11, marginTop: 6 }}>Scan to verify</p>
            </div>
          )}
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
        <Link to={`/verify?receipt=${encodeURIComponent(receipt.receiptId)}`} style={{ color: 'var(--color-teal-700)', fontWeight: 500 }}>
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
      <p className="mono" style={{ color: 'var(--color-ink)', wordBreak: 'break-all' }}>{value}</p>
    </div>
  );
}