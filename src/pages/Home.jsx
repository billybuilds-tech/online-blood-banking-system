import { Link } from 'react-router';

const ROLES = [
    { title: 'Donors', text: 'Register, book donation appointments, see your history and download a certificate after every verified donation.' },
    { title: 'Recipients', text: 'See which blood bank holds the blood group you need, send a request and follow its status.' },
    { title: 'Blood banks', text: 'Manage stock, verify donations, approve requests and exchange units with other banks.' },
    { title: 'Blood Bank Manager', text: 'Approve blood banks, manage users, monitor activity, send notifications and produce reports.' },
];

export default function Home() {
    return (
        <div className="home">
            <header className="home-top">
                <div className="brand">
                    <span className="brand-drop" aria-hidden="true" />
                    <span className="brand-text">Online Blood Bank</span>
                </div>
                <div className="home-actions">
                    <Link className="btn btn-ghost" to="/login">Log in</Link>
                    <Link className="btn btn-primary" to="/register">Register</Link>
                </div>
            </header>

            <section className="hero">
                <h1>One platform for blood donors, recipients and blood banks in Tanzania</h1>
                <p>
                    Find available blood across banks in seconds, book a donation, and move units between banks
                    through a controlled, recorded process.
                </p>
                <div className="hero-actions">
                    <Link className="btn btn-primary btn-lg" to="/register">Become a donor</Link>
                    <Link className="btn btn-ghost btn-lg" to="/register?role=recipient">Request blood</Link>
                </div>
            </section>

            <section className="role-grid">
                {ROLES.map((r) => (
                    <article key={r.title} className="role-card">
                        <h3>{r.title}</h3>
                        <p>{r.text}</p>
                    </article>
                ))}
            </section>

            <footer className="footer">Online Blood Banking System · Institute of Finance Management · 2026</footer>
        </div>
    );
}
