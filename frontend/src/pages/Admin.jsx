import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const BASE = '/api/admin';

export default function Admin() {
  const navigate = useNavigate();
  const adminToken = api.getAdminToken();

  const [elections, setElections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [electionName, setElectionName] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [candidate, setCandidate] = useState({ id: '', name: '', role: '', bio: '', color: '#1d5c48', photoUrl: '', symbol: '' });
  const [log, setLog] = useState([]);

  function appendLog(msg) {
    setLog((l) => [msg, ...l]);
  }

  function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };
  }

  async function loadElections() {
    const res = await fetch(`${BASE}/elections`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return appendLog(`Error: ${data.error}`);
    setElections(data.elections);
  }

  useEffect(() => {
    if (adminToken) loadElections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadElection(id) {
    const res = await fetch(`${BASE}/elections/${id}`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) return appendLog(`Error: ${data.error}`);
    setSelected(data);
  }

  async function createElection() {
    const res = await fetch(`${BASE}/elections`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: electionName, closesAt }),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Error: ${data.error}`);
    appendLog(`Created election "${data.name}"`);
    setElectionName('');
    setClosesAt('');
    await loadElections();
    await loadElection(data.id);
  }

  async function updateElection(patch) {
    if (!selected) return;
    const res = await fetch(`${BASE}/elections/${selected.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Error: ${data.error}`);
    appendLog('Election updated.');
    await loadElections();
    await loadElection(selected.id);
  }

  async function deleteElection() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    const res = await fetch(`${BASE}/elections/${selected.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Error: ${data.error}`);
    appendLog('Election deleted.');
    setSelected(null);
    await loadElections();
  }

  async function addCandidate() {
    if (!selected) return;
    const res = await fetch(`${BASE}/candidates`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...candidate, electionId: selected.id }),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Error: ${data.error}`);
    appendLog(`Added candidate "${data.name}"`);
    setCandidate({ id: '', name: '', role: '', bio: '', color: '#1d5c48', photoUrl: '', symbol: '' });
    await loadElection(selected.id);
  }

  async function removeCandidate(id) {
    if (!confirm('Remove this candidate?')) return;
    const res = await fetch(`${BASE}/candidates/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Error: ${data.error}`);
    appendLog('Candidate removed.');
    await loadElection(selected.id);
  }

  async function downloadReport() {
    if (!selected) return;
    const res = await fetch(`${BASE}/elections/${selected.id}/report.xlsx`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return appendLog(`Error: ${data.error || 'failed to generate report'}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.name.replace(/[^a-z0-9]+/gi, '-')}-report.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleSignOut() {
    api.clearAdminToken();
    navigate('/admin/login');
  }

  if (!adminToken) {
    return (
      <div className="shell" style={{ paddingTop: 64, textAlign: 'center' }}>
        <p style={{ marginBottom: 16 }}>Admin sign-in required.</p>
        <a href="/admin/login" className="btn btn-primary">Admin sign in →</a>
      </div>
    );
  }

  return (
    <div className="shell" style={{ paddingTop: 48, maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 26 }}>Admin portal</h1>
        <button className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, marginTop: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Elections</h3>
          {elections.map((e) => (
            <button
              key={e.id}
              onClick={() => loadElection(e.id)}
              className="card"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: 10,
                marginBottom: 8,
                cursor: 'pointer',
                border: selected?.id === e.id ? '2px solid var(--color-teal-700)' : '1px solid var(--color-border)',
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 500 }}>{e.name}</p>
              <p style={{ fontSize: 11 }}>{e.is_active ? 'Active' : 'Inactive'} · closes {new Date(e.closes_at).toLocaleDateString()}</p>
            </button>
          ))}

          <h4 style={{ fontSize: 13, marginTop: 16, marginBottom: 8 }}>Create new</h4>
          <input placeholder="Election name" value={electionName} onChange={(e) => setElectionName(e.target.value)} style={inputStyle} />
          <input
            placeholder="Closes at (ISO, e.g. 2026-09-20T18:00:00Z)"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            style={inputStyle}
          />
          <button className="btn btn-primary" onClick={createElection} style={{ marginTop: 6 }}>
            Create election
          </button>
        </div>

        <div className="card" style={{ padding: 20 }}>
          {!selected && <p style={{ fontSize: 13 }}>Select an election to manage it.</p>}
          {selected && (
            <>
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>{selected.name}</h3>

              <label style={{ fontSize: 12 }}>Closing time</label>
              <input
                defaultValue={new Date(selected.closes_at).toISOString().slice(0, 19)}
                onBlur={(e) => updateElection({ closesAt: e.target.value })}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => updateElection({ isActive: !selected.is_active })}>
                  {selected.is_active ? 'Deactivate' : 'Make active'}
                </button>
                <button className="btn btn-secondary" onClick={downloadReport}>
                  Download Excel report
                </button>
                <button
                  onClick={deleteElection}
                  className="btn btn-secondary"
                  style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                >
                  Delete election
                </button>
              </div>

              <h4 style={{ fontSize: 13, marginBottom: 8 }}>Candidates</h4>
              {selected.candidates.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: 13 }}>
                    {c.symbol && `${c.symbol} `}{c.name} — {c.votes} votes
                  </span>
                  <button onClick={() => removeCandidate(c.id)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>
                    Remove
                  </button>
                </div>
              ))}

              <h4 style={{ fontSize: 13, marginTop: 16, marginBottom: 8 }}>Add candidate</h4>
              <input placeholder="Slug id (e.g. jane-doe)" value={candidate.id} onChange={(e) => setCandidate({ ...candidate, id: e.target.value })} style={inputStyle} />
              <input placeholder="Name" value={candidate.name} onChange={(e) => setCandidate({ ...candidate, name: e.target.value })} style={inputStyle} />
              <input placeholder="Role" value={candidate.role} onChange={(e) => setCandidate({ ...candidate, role: e.target.value })} style={inputStyle} />
              <input placeholder="Bio" value={candidate.bio} onChange={(e) => setCandidate({ ...candidate, bio: e.target.value })} style={inputStyle} />
              <input placeholder="Photo URL (optional)" value={candidate.photoUrl} onChange={(e) => setCandidate({ ...candidate, photoUrl: e.target.value })} style={inputStyle} />
              <input placeholder="Symbol emoji (optional, e.g. 🌳)" value={candidate.symbol} onChange={(e) => setCandidate({ ...candidate, symbol: e.target.value })} style={inputStyle} />
              <button className="btn btn-primary" onClick={addCandidate} style={{ marginTop: 6 }}>
                Add candidate
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20, fontSize: 12 }}>
        {log.map((l, i) => (
          <div key={i} className="mono">{l}</div>
        ))}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  fontSize: 13,
  marginBottom: 10,
  background: 'var(--color-surface-sunken)',
};