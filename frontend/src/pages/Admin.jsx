import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import ActivityLog from '../components/ActivityLog';

const BASE = '/api/admin';
const DEFAULT_COLOR = '#16335c';
const EMPTY_CANDIDATE = { name: '', role: '', bio: '', color: DEFAULT_COLOR, photoUrl: '', symbol: '' };

// <input type="datetime-local"> wants local time as "YYYY-MM-DDTHH:mm".
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Candidate ids are globally unique in the database, so a short random
// suffix keeps the same name usable across different elections.
function slugify(name) {
  const base =
    name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'candidate';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

function statusOf(e) {
  if (new Date(e.closes_at) <= new Date()) return { label: 'Closed', cls: 'badge-closed' };
  if (e.is_active) return { label: 'Live', cls: 'badge-live' };
  return { label: 'Inactive', cls: 'badge-inactive' };
}

function initials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function Admin() {
  const navigate = useNavigate();
  const adminToken = api.getAdminToken();
  const noticeTimer = useRef(null);

  const [elections, setElections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newName, setNewName] = useState('');
  const [newCloses, setNewCloses] = useState('');
  const [closingInput, setClosingInput] = useState('');
  const [candidate, setCandidate] = useState(EMPTY_CANDIDATE);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  function notify(type, text) {
    clearTimeout(noticeTimer.current);
    setNotice({ type, text });
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }

  // Single place for every admin API call: adds the auth header, parses JSON
  // safely (a non-JSON error page can no longer fail silently), and sends the
  // admin back to sign-in if their session has expired.
  async function call(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      api.clearAdminToken();
      navigate('/admin/login');
      throw new Error('Session expired — please sign in again.');
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function loadElections() {
    try {
      const data = await call('/elections');
      setElections(data.elections);
    } catch (err) {
      notify('error', err.message);
    }
  }

  async function loadElection(id) {
    try {
      setSelected(await call(`/elections/${id}`));
    } catch (err) {
      notify('error', err.message);
    }
  }

  useEffect(() => {
    if (adminToken) loadElections();
    return () => clearTimeout(noticeTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) setClosingInput(toLocalInput(selected.closes_at));
  }, [selected]);

  async function createElection(e) {
    e.preventDefault();
    if (!newName.trim() || !newCloses) {
      return notify('error', 'Enter an election name and a closing date and time.');
    }
    setBusy(true);
    try {
      const created = await call('/elections', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), closesAt: new Date(newCloses).toISOString() }),
      });
      notify('success', `Created "${created.name}" and made it the active election.`);
      setNewName('');
      setNewCloses('');
      await loadElections();
      await loadElection(created.id);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateElection(patch, message) {
    if (!selected) return;
    try {
      await call(`/elections/${selected.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      notify('success', message);
      await Promise.all([loadElections(), loadElection(selected.id)]);
    } catch (err) {
      notify('error', err.message);
    }
  }

  function saveClosingTime() {
    if (!closingInput) return notify('error', 'Choose a closing date and time first.');
    updateElection({ closesAt: new Date(closingInput).toISOString() }, 'Closing time updated.');
  }

  async function deleteElection() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    try {
      await call(`/elections/${selected.id}`, { method: 'DELETE' });
      notify('success', 'Election deleted.');
      setSelected(null);
      await loadElections();
    } catch (err) {
      notify('error', err.message);
    }
  }

  async function addCandidate(e) {
    e.preventDefault();
    if (!selected) return;
    if (!candidate.name.trim()) return notify('error', 'Candidate name is required.');
    setBusy(true);
    try {
      const added = await call('/candidates', {
        method: 'POST',
        body: JSON.stringify({
          ...candidate,
          name: candidate.name.trim(),
          id: slugify(candidate.name),
          electionId: selected.id,
        }),
      });
      notify('success', `Added ${added.name}.`);
      setCandidate(EMPTY_CANDIDATE);
      await loadElection(selected.id);
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCandidate(c) {
    if (!window.confirm(`Remove ${c.name} from this election?`)) return;
    try {
      await call(`/candidates/${c.id}`, { method: 'DELETE' });
      notify('success', `Removed ${c.name}.`);
      await loadElection(selected.id);
    } catch (err) {
      notify('error', err.message);
    }
  }

  async function downloadReport() {
    if (!selected) return;
    try {
      const res = await fetch(`${BASE}/elections/${selected.id}/report.xlsx`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Report failed (${res.status})`);
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
      notify('success', 'Excel report downloaded.');
    } catch (err) {
      notify('error', err.message);
    }
  }

  const setField = (key) => (e) => setCandidate({ ...candidate, [key]: e.target.value });

  if (!adminToken) {
    return (
      <div className="shell" style={{ paddingTop: 64, textAlign: 'center' }}>
        <p style={{ marginBottom: 16 }}>Admin sign-in required.</p>
        <a href="/admin/login" className="btn btn-primary">Admin sign in →</a>
      </div>
    );
  }

  const liveCount = elections.filter((e) => statusOf(e).label === 'Live').length;
  const totalVotes = selected ? selected.candidates.reduce((sum, c) => sum + c.votes, 0) : null;
  const status = selected ? statusOf(selected) : null;

  return (
    <div className="shell admin-page">
      <div className="admin-header">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 style={{ marginTop: 12 }}>Election dashboard</h1>
          <p>Create elections, manage candidates, and export reports.</p>
        </div>
      </div>

      {notice && <div className={`notice notice-${notice.type}`}>{notice.text}</div>}

      <div className="admin-stats">
        <div className="card admin-stat">
          <p className="admin-stat-label">Total elections</p>
          <p className="admin-stat-value">{elections.length}</p>
          <p className="admin-stat-sub">All time</p>
        </div>
        <div className="card admin-stat">
          <p className="admin-stat-label">Live now</p>
          <p className="admin-stat-value">{liveCount}</p>
          <p className="admin-stat-sub">Open for voting</p>
        </div>
        <div className="card admin-stat">
          <p className="admin-stat-label">Candidates</p>
          <p className="admin-stat-value">{selected ? selected.candidates.length : '—'}</p>
          <p className="admin-stat-sub">{selected ? selected.name : 'Select an election'}</p>
        </div>
        <div className="card admin-stat">
          <p className="admin-stat-label">Votes cast</p>
          <p className="admin-stat-value">{totalVotes === null ? '—' : totalVotes.toLocaleString()}</p>
          <p className="admin-stat-sub">{selected ? selected.name : 'Select an election'}</p>
        </div>
      </div>

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="card admin-panel">
            <h3>Elections</h3>
            {elections.length === 0 && (
              <p style={{ fontSize: 13 }}>No elections yet — create your first one below.</p>
            )}
            {elections.map((e) => {
              const s = statusOf(e);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => loadElection(e.id)}
                  className={`election-item ${selected?.id === e.id ? 'selected' : ''}`}
                >
                  <div className="election-item-top">
                    <span className="election-item-name">{e.name}</span>
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                  </div>
                  <p className="election-item-meta">
                    Closes {new Date(e.closes_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </button>
              );
            })}
          </div>

          <form className="card admin-panel" onSubmit={createElection}>
            <h3>Create election</h3>
            <label className="admin-label">Election name</label>
            <input
              className="admin-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Student Council 2026"
              style={{ marginBottom: 16 }}
            />
            <label className="admin-label">Closes at</label>
            <input
              type="datetime-local"
              className="admin-input"
              value={newCloses}
              onChange={(e) => setNewCloses(e.target.value)}
              style={{ marginBottom: 20 }}
            />
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              Create election
            </button>
          </form>
        </aside>

        <main>
          {!selected ? (
            <div className="card empty-state">
              <div className="empty-icon">🗳️</div>
              <h3 style={{ marginBottom: 8 }}>No election selected</h3>
              <p style={{ fontSize: 13.5 }}>Choose an election from the list to manage it, or create a new one.</p>
            </div>
          ) : (
            <div className="card admin-panel">
              <div className="admin-main-header">
                <div>
                  <h2>{selected.name}</h2>
                  <span className={`badge ${status.cls}`}>{status.label}</span>
                </div>
                <div className="admin-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      updateElection(
                        { isActive: !selected.is_active },
                        selected.is_active ? 'Election deactivated.' : 'Election is now the active one.'
                      )
                    }
                  >
                    {selected.is_active ? 'Deactivate' : 'Make active'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={downloadReport}>
                    ⬇ Excel report
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={deleteElection}>
                    Delete
                  </button>
                </div>
              </div>

              <section className="admin-section">
                <h4 className="admin-section-title">Schedule</h4>
                <div className="inline-form">
                  <div className="grow">
                    <label className="admin-label">Closing date and time</label>
                    <input
                      type="datetime-local"
                      className="admin-input"
                      value={closingInput}
                      onChange={(e) => setClosingInput(e.target.value)}
                    />
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={saveClosingTime}>
                    Save closing time
                  </button>
                </div>
                {status.label === 'Closed' && (
                  <p style={{ fontSize: 12.5, marginTop: 10 }}>
                    This election has closed. Move the closing time into the future to reopen voting.
                  </p>
                )}
              </section>

              <section className="admin-section">
                <h4 className="admin-section-title">
                  Candidates <span>({selected.candidates.length})</span>
                </h4>
                {selected.candidates.length === 0 ? (
                  <p style={{ fontSize: 13 }}>No candidates yet — add the first one below.</p>
                ) : (
                  <div className="candidate-grid">
                    {selected.candidates.map((c) => (
                      <div key={c.id} className="candidate-card">
                        <div className="candidate-card-top">
                          {c.photo_url ? (
                            <img
                              src={c.photo_url}
                              alt={c.name}
                              className="candidate-avatar"
                              style={{ border: `2px solid ${c.color || DEFAULT_COLOR}` }}
                            />
                          ) : (
                            <div className="candidate-avatar" style={{ background: c.color || DEFAULT_COLOR }}>
                              {initials(c.name)}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <p className="candidate-name">
                              {c.symbol && <span style={{ marginRight: 6 }}>{c.symbol}</span>}
                              {c.name}
                            </p>
                            <p className="candidate-role">{c.role || 'No role set'}</p>
                          </div>
                        </div>
                        <div className="candidate-card-bottom">
                          <span>
                            <strong>{c.votes}</strong> {c.votes === 1 ? 'vote' : 'votes'}
                          </span>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeCandidate(c)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="admin-section">
                <h4 className="admin-section-title">Add candidate</h4>
                <form onSubmit={addCandidate}>
                  <div className="form-grid">
                    <div>
                      <label className="admin-label">Full name *</label>
                      <input className="admin-input" value={candidate.name} onChange={setField('name')} placeholder="Jane Doe" required />
                    </div>
                    <div>
                      <label className="admin-label">Role / position</label>
                      <input className="admin-input" value={candidate.role} onChange={setField('role')} placeholder="Director of Finance" />
                    </div>
                    <div>
                      <label className="admin-label">Symbol (emoji)</label>
                      <input className="admin-input" value={candidate.symbol} onChange={setField('symbol')} placeholder="🌳" />
                    </div>
                    <div>
                      <label className="admin-label">Photo URL</label>
                      <input type="url" className="admin-input" value={candidate.photoUrl} onChange={setField('photoUrl')} placeholder="https://…" />
                    </div>
                    <div>
                      <label className="admin-label">Accent colour</label>
                      <input
                        type="color"
                        className="admin-input"
                        style={{ padding: 4, height: 44 }}
                        value={candidate.color}
                        onChange={setField('color')}
                      />
                    </div>
                    <div className="span-all">
                      <label className="admin-label">Short bio</label>
                      <textarea
                        className="admin-input"
                        rows={3}
                        style={{ resize: 'vertical' }}
                        value={candidate.bio}
                        onChange={setField('bio')}
                        placeholder="One or two sentences voters will see on the ballot."
                      />
                    </div>
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={busy}>
                    Add candidate
                  </button>
                </form>
              </section>
            </div>
          )}
        </main>
      </div>

      <ActivityLog adminToken={adminToken} refreshKey={notice} />
    </div>
  );
}