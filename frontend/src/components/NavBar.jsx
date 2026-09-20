import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api/client';

export default function NavBar() {
  const navigate = useNavigate();
  const signedIn = Boolean(api.getToken());
  const [theme, setTheme] = useState(() => localStorage.getItem('cloudvote_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cloudvote_theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  function handleSignOut() {
    api.clearToken();
    navigate('/');
  }

  return (
    <nav className="nav">
      <div className="nav-brand">
        <span
          className="mark"
          style={{ background: 'linear-gradient(135deg, var(--color-teal-600), var(--color-gold))' }}
        />
        cloud<span style={{ color: 'var(--color-gold)' }}>vote</span>
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
        <span>
          <span className="status-dot" />
          Network healthy
        </span>
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