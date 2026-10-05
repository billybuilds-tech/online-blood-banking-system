import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from './auth.jsx';

// Sections of each role's dashboard. The side menu lists them and each opens at /dashboard/<id>.
export const SECTIONS = {
    donor: [
        { id: 'overview', label: 'Overview', icon: 'home' },
        { id: 'book', label: 'Book donation', icon: 'calendar' },
        { id: 'appointments', label: 'My appointments', icon: 'list' },
        { id: 'history', label: 'Donation history', icon: 'award' },
        { id: 'need', label: 'I need blood', icon: 'drop' },
        { id: 'find', label: 'Find blood', icon: 'search' },
    ],
    recipient: [
        { id: 'find', label: 'Find blood', icon: 'search' },
        { id: 'request', label: 'Request blood', icon: 'drop' },
        { id: 'requests', label: 'My requests', icon: 'list' },
    ],
    bloodbank: [
        { id: 'overview', label: 'Overview', icon: 'home' },
        { id: 'stock', label: 'Stock', icon: 'box' },
        { id: 'appointments', label: 'Donations', icon: 'clipboard' },
        { id: 'requests', label: 'Blood requests', icon: 'drop' },
        { id: 'transfers', label: 'Inter-bank', icon: 'swap' },
        { id: 'appeals', label: 'Donor appeals', icon: 'megaphone' },
        { id: 'transactions', label: 'Transactions', icon: 'receipt' },
    ],
    admin: [
        { id: 'overview', label: 'Overview', icon: 'home' },
        { id: 'statistics', label: 'Statistics', icon: 'chart' },
        { id: 'approvals', label: 'Bank approvals', icon: 'check' },
        { id: 'users', label: 'Users', icon: 'users' },
        { id: 'activity', label: 'Activity', icon: 'activity' },
        { id: 'reports', label: 'Reports', icon: 'file' },
        { id: 'notify', label: 'Send notification', icon: 'send' },
    ],
};

const NavContext = createContext({ counts: {}, setCounts: () => {} });

// Holds the numbers shown beside the menu items (pending requests, open bookings…).
export function NavProvider({ children }) {
    const [counts, setCounts] = useState({});
    const value = useMemo(() => ({ counts, setCounts }), [counts]);
    return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNavCounts() {
    return useContext(NavContext).counts;
}

// The section open in the dashboard, taken from the address, and a function that opens another.
export function useSection() {
    const { user } = useAuth();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const sections = SECTIONS[user.role];
    const requested = pathname.split('/')[2];
    const active = sections.some((s) => s.id === requested) ? requested : sections[0].id;
    const goTo = useCallback((id) => navigate(`/dashboard/${id}`), [navigate]);
    return [active, goTo];
}

// A dashboard reports its numbers for the side menu, e.g. useSectionCounts({ requests: 3 }).
export function useSectionCounts(counts) {
    const { setCounts } = useContext(NavContext);
    const key = JSON.stringify(counts);
    useEffect(() => { setCounts(JSON.parse(key)); }, [key, setCounts]);
}
