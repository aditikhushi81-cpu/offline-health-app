import { apiPost } from "../api";
import { useState } from "react";
import AuthLayout from "../components/AuthLayout";

function ResendVerification({ onBack }) {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setMessage("");
        setLoading(true);
        try {
            const data = await apiPost("/auth/resend-verification", { email });
            setMessage(data.message);
        } catch (err) {
            setError(err.message || "Could not reach the server. This needs an internet connection.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <h1>Resend verification</h1>
            <p className="subtitle">Enter your email and we will send a new verification link.</p>

            <form onSubmit={handleSubmit}>
                <div className="field">
                    <label htmlFor="rv-email">Email address</label>
                    <div className="input-wrap">
                        <input
                            id="rv-email"
                            className="plain"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                </div>
                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? "Sending..." : "Send verification link"}
                </button>
            </form>

            <div className="divider">Done?</div>
            <button type="button" className="btn-secondary" onClick={onBack}>Back to sign in</button>

            {message && <div className="sync-msg" style={{ marginTop: 12 }}>{message}</div>}
            {error && <div className="error-box">{error}</div>}
        </AuthLayout>
    );
}

export default ResendVerification;