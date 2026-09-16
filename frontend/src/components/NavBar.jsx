import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function NavBar() {
  const navigate = useNavigate();
  const signedIn = Boolean(api.getToken());

  function handleSignOut() {
    api.clearToken();
    navigate('/');
  }

  return (
    <nav className="nav">
      <div className="nav-brand">
        <span className="mark" />
        cloud<span style={{ color: 'var(--color-teal-700)' }}>vote</span>
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
        <NavLink to="/verify" className={({ isActive }) => (isActive ? 'active' : '')}>
          Verify your vote
        </NavLink>
      </div>
      <div className="nav-right">
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
