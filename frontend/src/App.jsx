import { Routes, Route, useLocation } from 'react-router-dom';
import UtilityBar from './components/UtilityBar';
import NavBar from './components/NavBar';
import AdminNavBar from './components/AdminNavBar';
import Footer from './components/Footer';
import Overview from './pages/Overview';
import Register from './pages/Register';
import SignIn from './pages/SignIn';
import MfaSetup from './pages/MfaSetup';
import Vote from './pages/Vote';
import Receipt from './pages/Receipt';
import Results from './pages/Results';
import VerifyReceipt from './pages/VerifyReceipt';
import Archive from './pages/Archive';
import StatusPage from './pages/StatusPage';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';

export default function App() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <>
      {!isAdminRoute && <UtilityBar />}
      {isAdminRoute ? <AdminNavBar /> : <NavBar />}
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/register" element={<Register />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/mfa-setup" element={<MfaSetup />} />
        <Route path="/vote" element={<Vote />} />
        <Route path="/receipt" element={<Receipt />} />
        <Route path="/results" element={<Results />} />
        <Route path="/verify" element={<VerifyReceipt />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/login" element={<AdminLogin />} />
      </Routes>
      {!isAdminRoute && <Footer />}
    </>
  );
}