import { useState, useEffect } from "react";

export function LogoIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
      <path d="M6 12h3l2-3 2 5 2-2h3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function AuthLayout({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <div className="page">
      <aside className="brand-panel">
        <div className="brand-logo">
          <span className="logo-icon"><LogoIcon /></span>
          Rural Health Records
        </div>

        <div className="brand-body">
          <h2>Care that keeps working when the network doesn't.</h2>
          <p>
            Record patient details and vitals anywhere, even in villages with
            no signal. Everything syncs safely once you're back online.
          </p>
          <ul className="feature-list">
            <li><span className="dot"><CheckIcon /></span>Works fully offline, no data lost</li>
            <li><span className="dot"><CheckIcon /></span>Automatic sync when connection returns</li>
            <li><span className="dot"><CheckIcon /></span>Secure, role-based access for staff</li>
          </ul>
        </div>

        <div className="brand-footer">© 2026 Rural Health Records</div>
      </aside>

      <main className="form-panel">
        <div className={`status-badge ${isOnline ? "online" : "offline"}`}>
          <span className="pulse" />
          {isOnline ? "Online" : "Offline"}
        </div>

        <div className="form-card">
          <div className="mobile-logo">
            <LogoIcon size={28} /> Rural Health Records
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export default AuthLayout;