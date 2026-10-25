import { apiPost } from "../api";
import { useState } from "react";
import AuthLayout from "../components/AuthLayout";

function ResetPassword({ token, onDone }) {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirm) {
            setError("The two passwords do not match.");
            return;
        }
        setLoading(true);
        try {
            await apiPost("/auth/reset-password", { token, password });
            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout>
            <h1>Set a new password</h1>

            {done ? (
                <>
                    <p className="subtitle">Password updated. You can now sign in.</p>
                    <button type="button" className="btn-primary" onClick={onDone}>Go to sign in</button>
                </>
            ) : (
                <form onSubmit={handleSubmit}>
                    <div className="field">
                        <label htmlFor="rp-pass">New password</label>
                        <div className="input-wrap">
                            <input id="rp-pass" className="plain" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
                        </div>
                    </div>
                    <div className="field">
                        <label htmlFor="rp-confirm">Confirm password</label>
                        <div className="input-wrap">
                            <input id="rp-confirm" className="plain" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                        </div>
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? "Saving..." : "Update password"}
                    </button>
                </form>
            )}

            {error && <div className="error-box">{error}</div>}
        </AuthLayout>
    );
}

export default ResetPassword;