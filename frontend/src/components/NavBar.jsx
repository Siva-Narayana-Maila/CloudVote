import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Logo from './Logo';

const STATUS_UI = {
  checking: { label: 'Checking…', color: '#8a94a8' },
  operational: { label: 'Operational', color: '#2e8f56' },
  degraded: { label: 'Degraded', color: '#c9a227' },
  offline: { label: 'Offline', color: '#c0392b' },
};

export default function NavBar() {
  const navigate = useNavigate();
  const signedIn = Boolean(api.getToken());
  const [theme, setTheme] = useState(() => localStorage.getItem('cloudvote_theme') || 'light');
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cloudvote_theme', theme);
  }, [theme]);

  // Real health indicator: asks the gateway for the live status of every
  // service once a minute instead of showing a hardcoded "healthy" label.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const data = await api.getStatus();
        if (!cancelled) setStatus(data.overall);
      } catch {
       if (!cancelled) setStatus('offline');
      }
    }
    check();
    const id = setInterval(check, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  function handleSignOut() {
    api.clearToken();
    navigate('/');
  }

  const ui = STATUS_UI[status] || STATUS_UI.checking;

  return (
    <nav className="nav">
      <div className="nav-brand">
        <Logo size={30} wordmarkSize={16} variant="light" />
      </div>
      <div className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Overview
        </NavLink>
        <NavLink to="/vote" className={({ isActive }) => (isActive ? 'active' : '')}>
          Vote
        </NavLink>
        <NavLink to="/results" className={({ isActive }) => (isActive ? 'active' : '')}>
          Live results
        </NavLink>
        <NavLink to="/archive" className={({ isActive }) => (isActive ? 'active' : '')}>
          Archive
        </NavLink>
        {signedIn && (
          <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
            Profile
          </NavLink>
        )}
      </div>
      <div className="nav-right">
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#fdfcf9',
            borderRadius: 999,
            width: 30,
            height: 30,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <Link
          to="/status"
          title="View system status"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none' }}
        >
          <span className="status-dot" style={{ background: ui.color, marginRight: 0 }} />
          {ui.label}
        </Link>
        {signedIn ? (
          <button onClick={handleSignOut} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>
            Sign out
          </button>
        ) : (
          <NavLink to="/signin" className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 12, textDecoration: 'none' }}>
            Sign in
          </NavLink>
        )}
      </div>
    </nav>
  );
}