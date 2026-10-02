import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Register from './pages/Register.jsx';
import BloodBankDashboard from './pages/bank/BloodBankDashboard.jsx';
import DonorDashboard from './pages/donor/DonorDashboard.jsx';
import ManagerDashboard from './pages/manager/ManagerDashboard.jsx';
import RecipientDashboard from './pages/recipient/RecipientDashboard.jsx';

const DASHBOARDS = {
    donor: DonorDashboard,
    recipient: RecipientDashboard,
    bloodbank: BloodBankDashboard,
    admin: ManagerDashboard,
};

function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="page-loading">Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    return <Layout>{children}</Layout>;
}

function Dashboard() {
    const { user } = useAuth();
    const Component = DASHBOARDS[user.role];
    return <Component />;
}

export default function App() {
    const { user } = useAuth();
    return (
        <Routes>
            <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Home />} />
            <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
            <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
