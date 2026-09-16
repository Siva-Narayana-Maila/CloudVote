import { useState } from 'react';
import { api } from '../api/client';

export default function VerifyReceipt() {
  const [receiptId, setReceiptId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleVerify(e) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await api.verifyReceipt(receiptId.trim());
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell" style={{ paddingTop: 56, display: 'flex', justifyContent: 'center' }}>
      <div className="card" style={{ padding: 32, width: 440 }}>
        <span className="eyebrow">Public verification</span>
        <h2 style={{ fontSize: 22, marginTop: 16 }}>Verify a receipt.</h2>
        <p style={{ marginTop: 8, fontSize: 13.5 }}>
          Paste any receipt ID to independently confirm it's recorded in the ledger — no sign-in
          required.
        </p>

        <form onSubmit={handleVerify} style={{ marginTop: 20 }}>
          <input
            value={receiptId}
            onChange={(e) => setReceiptId(e.target.value)}
            placeholder="CV-XXXXXXXX-XXXX"
            className="mono"
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-sunken)',
              marginBottom: 14,
            }}
          />
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'Checking…' : 'Verify →'}
          </button>
        </form>

        {error && <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>}

        {result && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 10,
              background: result.verified ? '#e6f0ea' : '#fbeee9',
              color: result.verified ? 'var(--color-teal-700)' : 'var(--color-danger)',
              fontSize: 13.5,
            }}
          >
            {result.verified ? '✓ ' : '✕ '}
            {result.reason}
            {result.ledgerPosition && (
              <p className="mono" style={{ marginTop: 6, fontSize: 12, color: 'inherit' }}>
                Ledger position #{result.ledgerPosition}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}