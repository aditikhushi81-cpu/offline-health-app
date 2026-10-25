import { useState } from "react";
import AuthLayout from "../components/AuthLayout";
import { apiPost } from "../api";

function Register({ onSwitch }) {
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        confirm: "",
    });
    const [agreed, setAgreed] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [sentTo, setSentTo] = useState("");

    const update = (field) => (e) =>
        setForm({ ...form, [field]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (form.password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (form.password !== form.confirm) {
            setError("Passwords do not match.");
            return;
        }
        if (!agreed) {
            setError("Please accept the consent notice to continue.");
            return;
        }

        setLoading(true);
        try {
            await apiPost("/auth/register", {
                name: form.name,
                email: form.email,
                password: form.password,
            });
            setSentTo(form.email.trim());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (sentTo) {
        return (
            <AuthLayout>
                <h1>Check your email</h1>
                <p className="subtitle">
                    We sent a verification link to <strong>{sentTo}</strong>. Click it to
                    activate your account, then sign in. The link works once and expires in 24 hours.
                </p>
                <button type="button" className="btn-primary" onClick={onSwitch}>
                    Go to sign in
                </button>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout>
            <h1>Create your account</h1>
            <p className="subtitle">Register as healthcare staff to get started</p>

            {error && <div className="error-box">{error}</div>}

            <form onSubmit={handleSubmit}>
                <div className="field">
                    <label htmlFor="name">Full name</label>
                    <div className="input-wrap">
                        <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="8" r="4" />
                            <path d="M4 21a8 8 0 0 1 16 0" />
                        </svg>
                        <input
                            id="name"
                            type="text"
                            value={form.name}
                            onChange={update("name")}
                            placeholder="Your full name"
                            required
                        />
                    </div>
                </div>

                <div className="field">
                    <label htmlFor="reg-email">Email address</label>
                    <div className="input-wrap">
                        <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-10 6L2 7" />
                        </svg>
                        <input
                            id="reg-email"
                            type="email"
                            value={form.email}
                            onChange={update("email")}
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                </div>

                <div className="field">
                    <label htmlFor="reg-password">Password</label>
                    <div className="input-wrap">
                        <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <input
                            id="reg-password"
                            type="password"
                            value={form.password}
                            onChange={update("password")}
                            placeholder="At least 8 characters"
                            required
                        />
                    </div>
                </div>

                <div className="field">
                    <label htmlFor="confirm">Confirm password</label>
                    <div className="input-wrap">
                        <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <input
                            id="confirm"
                            type="password"
                            value={form.confirm}
                            onChange={update("confirm")}
                            placeholder="Re-enter your password"
                            required
                        />
                    </div>
                </div>

                <label className="checkbox-row">
                    <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <span>
                        I understand this app stores sensitive health data, and I will only
                        record information with the patient's consent.
                    </span>
                </label>

                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? "Creating account..." : "Create account"}
                </button>
            </form>

            <p className="switch-text">
                Already have an account?{" "}
                <button type="button" className="link-btn" onClick={onSwitch}>
                    Sign in
                </button>
            </p>
            <p className="switch-text" style={{ fontSize: "0.85rem" }}>
                New accounts are created as nurse / health worker. Doctor access is granted by an administrator.
            </p>
        </AuthLayout>
    );
}

export default Register;