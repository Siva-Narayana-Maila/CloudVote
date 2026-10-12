import { Link, useNavigate } from 'react-router-dom';
import Logo from './Logo';
import { api } from '../api/client';

export default function AdminNavBar() {
  const navigate = useNavigate();
  function handleSignOut() {
    api.clearAdminToken();
    navigate('/admin/login');
  }
  return (
    <nav className="nav">
      <Link to="/admin" style={{ textDecoration: 'none' }}>
        <Logo size={28} wordmarkSize={15} variant="light" />
      </Link>
      <div className="nav-links">
        <span style={{ color: '#f3e9e5', fontSize: 12, fontWeight: 500, padding: '7px 14px' }}>Dashboard</span>
      </div>
      <div className="nav-right">
        {api.getAdminToken() && (
          <button onClick={handleSignOut} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>
            Sign out
          </button>
        )}
      </div>
    </nav>
  );
}