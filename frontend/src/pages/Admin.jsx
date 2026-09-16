import { useState } from 'react';

const BASE = '/api/admin';

export default function Admin() {
  const [adminKey, setAdminKey] = useState('');
  const [electionName, setElectionName] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [electionId, setElectionId] = useState('');
  const [candidate, setCandidate] = useState({ id: '', name: '', role: '', bio: '', color: '#1d5c48' });
  const [log, setLog] = useState([]);

  function appendLog(msg) {
    setLog((l) => [msg, ...l]);
  }

  async function createElection() {
    const res = await fetch(`${BASE}/elections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ name: electionName, closesAt }),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Error: ${data.error}`);
    setElectionId(data.id);
    appendLog(`Created election "${data.name}" (id: ${data.id})`);
  }

  async function addCandidate() {
    const res = await fetch(`${BASE}/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ ...candidate, electionId }),
    });
    const data = await res.json();
    if (!res.ok) return appendLog(`Error: ${data.error}`);
    appendLog(`Added candidate "${data.name}"`);
    setCandidate({ id: '', name: '', role: '', bio: '', color: '#1d5c48' });
  }

  return (
    <div className="shell" style={{ paddingTop: 48, maxWidth: 560 }}>
      <h1 style={{ fontSize: 26 }}>Admin</h1>
      <p style={{ marginTop: 8, fontSize: 13 }}>Not linked from navigation on purpose — bookmark this page.</p>

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <label style={{ fontSize: 12.5, fontWeight: 500 }}>Admin key</label>
        <input value={adminKey} onChange={(e) => setAdminKey(e.target.value)} style={inputStyle} type="password" />
      </div>

      <div className="card" style={{ padding: 20, marginTop: 16 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>1. Create election</h3>
        <label style={{ fontSize: 12.5 }}>Name</label>
        <input value={electionName} onChange={(e) => setElectionName(e.target.value)} style={inputStyle} />
        <label style={{ fontSize: 12.5 }}>Closes at (ISO, e.g. 2026-09-20T18:00:00Z)</label>
        <input
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
          style={inputStyle}
          placeholder="2026-09-20T18:00:00Z"
        />
        <button className="btn btn-primary" onClick={createElection} style={{ marginTop: 10 }}>
          Create election
        </button>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 16 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>2. Add candidate</h3>
        <label style={{ fontSize: 12.5 }}>Election ID</label>
        <input value={electionId} onChange={(e) => setElectionId(e.target.value)} style={inputStyle} />
        <label style={{ fontSize: 12.5 }}>Candidate slug id (e.g. jane-doe)</label>
        <input value={candidate.id} onChange={(e) => setCandidate({ ...candidate, id: e.target.value })} style={inputStyle} />
        <label style={{ fontSize: 12.5 }}>Name</label>
        <input value={candidate.name} onChange={(e) => setCandidate({ ...candidate, name: e.target.value })} style={inputStyle} />
        <label style={{ fontSize: 12.5 }}>Role</label>
        <input value={candidate.role} onChange={(e) => setCandidate({ ...candidate, role: e.target.value })} style={inputStyle} />
        <label style={{ fontSize: 12.5 }}>Bio</label>
        <input value={candidate.bio} onChange={(e) => setCandidate({ ...candidate, bio: e.target.value })} style={inputStyle} />
        <button className="btn btn-primary" onClick={addCandidate} style={{ marginTop: 10 }}>
          Add candidate
        </button>
      </div>

      <div style={{ marginTop: 20, fontSize: 12.5 }}>
        {log.map((l, i) => (
          <div key={i} className="mono">
            {l}
          </div>
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
  marginBottom: 12,
  marginTop: 4,
  background: 'var(--color-surface-sunken)',
};