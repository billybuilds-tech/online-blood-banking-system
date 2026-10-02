import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';

// Each role's dashboard is loaded only when that role logs in, keeping the first download small.
const DASHBOARDS = {
    donor: lazy(() => import('./pages/donor/DonorDashboard.jsx')),
    recipient: lazy(() => import('./pages/recipient/RecipientDashboard.jsx')),
    bloodbank: lazy(() => import('./pages/bank/BloodBankDashboard.jsx')),
    admin: lazy(() => import('./pages/manager/ManagerDashboard.jsx')),
};
const Profile = lazy(() => import('./pages/Profile.jsx'));

function RequireAuth({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="page-loading">Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    return (
        <Layout>
            <Suspense fallback={<div className="page-loading">Loading…</div>}>{children}</Suspense>
        </Layout>
    );
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
