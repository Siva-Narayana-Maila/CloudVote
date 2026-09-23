import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Overview from './pages/Overview';
import Register from './pages/Register';
import SignIn from './pages/SignIn';
import MfaSetup from './pages/MfaSetup';
import Vote from './pages/Vote';
import Receipt from './pages/Receipt';
import Results from './pages/Results';
import VerifyReceipt from './pages/VerifyReceipt';
import Admin from './pages/Admin';
import Footer from './components/Footer';
import Profile from './pages/Profile';
import AdminLogin from './pages/AdminLogin';

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/register" element={<Register />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/mfa-setup" element={<MfaSetup />} />
        <Route path="/vote" element={<Vote />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/receipt" element={<Receipt />} />
        <Route path="/results" element={<Results />} />
        <Route path="/verify" element={<VerifyReceipt />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/login" element={<AdminLogin />} />
      </Routes>
      <Footer />
    </>
  );
}