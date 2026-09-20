import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [votes, setVotes] = useState(null);
  const [form, setForm] = useState({ email: '', currentPassword: '', newPassword: '' });
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getProfile().then((p) => {
      setProfile(p);
      setForm((f) => ({ ...f, email: p.email }));
    }).catch((err) => setError(err.message));
    api.getMyVotes().then((v) => setVotes(v.votes)).catch(() => {});
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const payload = { email: form.email, currentPassword: form.currentPassword };
      if (form.newPassword) payload.newPassword = form.newPassword;
      const updated = await api.updateProfile(payload);
      setProfile(updated);
      setForm({ email: updated.email, currentPassword: '', newPassword: '' });
      setMessage('Profile updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!api.getToken()) {
    return (
      <div className="shell" style={{ paddingTop: 64, textAlign: 'center' }}>
        <p style={{ marginBottom: 16 }}>Sign in to view your profile.</p>
        <a href="/signin" className="btn btn-primary">Sign in →</a>
      </div>
    );
  }

  return (
    <div className="shell" style={{ paddingTop: 48, maxWidth: 640 }}>
      <h1 style={{ fontSize: 26 }}>Your account</h1>

      {profile && (
        <div className="card" style={{ padding: 24, marginTop: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Account details</h3>
          <p style={{ fontSize: 12.5, marginBottom: 16 }}>
            Member since {new Date(profile.created_at).toLocaleDateString()} ·{' '}
            {profile.mfa_enabled ? '✓ MFA enabled' : 'MFA not enabled'}
          </p>

          <form onSubmit={handleSave}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={inputStyle}
            />
            <label style={labelStyle}>New password (leave blank to keep current)</label>
            <input
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              style={inputStyle}
            />
            <label style={labelStyle}>Current password (required to save changes)</label>
            <input
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              style={inputStyle}
            />

            {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}
            {message && (
              <div style={{ marginBottom: 14, fontSize: 13, color: 'var(--color-teal-700)' }}>{message}</div>
            )}

            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 24, marginTop: 20 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Your voting history</h3>
        {!votes && <p style={{ fontSize: 13 }}>Loading…</p>}
        {votes && votes.length === 0 && <p style={{ fontSize: 13 }}>You haven't voted in anything yet.</p>}
        {votes && votes.map((v) => (
          <div
            key={v.receipt_id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink)' }}>{v.election_name}</p>
              <p style={{ fontSize: 12 }}>
                Voted for {v.candidate_name} · {new Date(v.cast_at).toLocaleString()}
              </p>
            </div>
            <span className="mono" style={{ fontSize: 11 }}>{v.receipt_id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 500, marginBottom: 6, marginTop: 12, color: 'var(--color-ink)' };
const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  background: 'var(--color-surface-sunken)',
};