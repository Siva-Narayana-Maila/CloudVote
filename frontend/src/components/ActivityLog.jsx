import { useEffect, useState } from 'react';

const ACTION_LABELS = {
  'election.create': 'Created election',
  'election.update': 'Updated election',
  'election.delete': 'Deleted election',
  'candidate.add': 'Added candidate',
  'candidate.remove': 'Removed candidate',
  'report.export': 'Exported report',
};

function describe(entry) {
  const d = entry.details || {};
  if (entry.action === 'election.update' && d.changes) {
    const fields = Object.keys(d.changes).join(', ');
    return d.name ? `"${d.name}" — changed ${fields}` : `changed ${fields}`;
  }
  return d.name ? `"${d.name}"` : '';
}

// Shows the most recent admin actions. `refreshKey` changes whenever the
// dashboard does something, which makes the log reload itself.
export default function ActivityLog({ adminToken, refreshKey }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/audit-log?limit=25', { headers: { Authorization: `Bearer ${adminToken}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setEntries(data.entries);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [adminToken, refreshKey]);

  return (
    <div className="card" style={{ marginTop: 24, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <h3 style={{ fontSize: 17 }}>Activity log</h3>
        <span style={{ fontSize: 12 }}>Every admin action is recorded here</span>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!entries && !error && <p style={{ fontSize: 13 }}>Loading…</p>}
      {entries && entries.length === 0 && (
        <p style={{ fontSize: 13 }}>No admin activity recorded yet.</p>
      )}

      {entries &&
        entries.map((entry, i) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              padding: '12px 0',
              borderBottom: i === entries.length - 1 ? 'none' : '1px solid var(--color-border)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)' }}>
                {ACTION_LABELS[entry.action] || entry.action}
              </p>
              <p style={{ fontSize: 12, marginTop: 2 }}>{describe(entry)}</p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 12, color: 'var(--color-ink)' }}>{entry.admin_email}</p>
              <p style={{ fontSize: 11.5, marginTop: 2 }}>
                {new Date(entry.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </div>
        ))}
    </div>
  );
}