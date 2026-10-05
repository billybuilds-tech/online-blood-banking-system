import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { useI18n } from './i18n.jsx';
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
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));

// Pages after login share one layout (side menu, notifications), kept while moving between them.
function RequireAuth() {
    const { user, loading } = useAuth();
    const { t } = useI18n();
    if (loading) return <div className="page-loading">{t('Loading…')}</div>;
    if (!user) return <Navigate to="/login" replace />;
    return <Layout />;
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
            <Route path="/forgot-password" element={<Suspense fallback={null}><ForgotPassword /></Suspense>} />
            <Route path="/reset-password" element={<Suspense fallback={null}><ResetPassword /></Suspense>} />
            <Route element={<RequireAuth />}>
                <Route path="/dashboard/:section?" element={<Dashboard />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/notifications" element={<Notifications />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
