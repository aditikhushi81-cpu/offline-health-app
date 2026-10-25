import { apiPost } from "../api";
import { useState } from "react";

import AuthLayout from "../components/AuthLayout";

function Login({ onSwitch, onAuth, onForgot, onResend }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const data = await apiPost("/auth/login", { email, password });
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            onAuth(data.user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <h1>Welcome back</h1>
            <p className="subtitle">Sign in to access patient records</p>

            <form onSubmit={handleSubmit}>
                <div className="field">
                    <label htmlFor="email">Email address</label>
                    <div className="input-wrap">
                        <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2" />
                            <path d="m22 7-10 6L2 7" />
                        </svg>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                </div>

                <div className="field">
                    <label htmlFor="password">Password</label>
                    <div className="input-wrap">
                        <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                        />
                        <button
                            type="button"
                            className="toggle-pass"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {showPassword ? (
                                    <>
                                        <path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-3 4.2" />
                                        <path d="M6.6 6.6A17 17 0 0 0 2 12s3 8 10 8a10 10 0 0 0 5.4-1.6" />
                                        <path d="m2 2 20 20" />
                                    </>
                                ) : (
                                    <>
                                        <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </>
                                )}
                            </svg>
                        </button>
                    </div>
                </div>

                <div style={{ textAlign: "right", margin: "-4px 0 12px" }}>
                    <button
                        type="button"
                        onClick={onForgot}
                        style={{ background: "none", border: "none", color: "#0f766e", cursor: "pointer", fontSize: "0.9rem", padding: 0 }}
                    >
                        Forgot password?
                    </button>
                </div>

                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? "Signing in..." : "Sign in"}
                </button>
            </form>

            <div className="divider">New to the app?</div>

            <button type="button" className="btn-secondary" onClick={onSwitch}>
                Create an account
            </button>

            <p className="legal">
                Patient data is sensitive. By signing in you agree to handle
                records responsibly and only with patient consent.
            </p>
                        {error && <div className="error-box">{error}</div>}
            <p className="switch-text" style={{ fontSize: "0.9rem" }}>
                Did not get the verification email?{" "}
                <button type="button" className="link-btn" onClick={onResend}>
                    Resend it
                </button>
            </p>
        </AuthLayout>
    );
}

export default Login;