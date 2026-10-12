import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

export default function VerifyReceipt() {
  const [params] = useSearchParams();
  const initialId = params.get('receipt') || '';

  const [receiptId, setReceiptId] = useState(initialId);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function verify(id) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      setResult(await api.verifyReceipt(id.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (receiptId.trim()) verify(receiptId);
  }

  // Opened from a receipt's QR code: verify straight away, no typing needed.
  useEffect(() => {
    if (initialId) verify(initialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="shell" style={{ paddingTop: 56, display: 'flex', justifyContent: 'center' }}>
      <div className="card" style={{ padding: 32, width: 440 }}>
        <span className="eyebrow">Public verification</span>
        <h2 style={{ fontSize: 22, marginTop: 16 }}>Verify a receipt.</h2>
        <p style={{ marginTop: 8, fontSize: 13.5 }}>
          Paste any receipt ID — or scan its QR code — to independently confirm it's recorded in
          the ledger. No sign-in required.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
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
              color: 'var(--color-ink)',
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
              background: result.verified ? 'rgba(46, 143, 86, 0.14)' : 'rgba(161, 58, 44, 0.1)',
              color: result.verified ? '#2e8f56' : 'var(--color-danger)',
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