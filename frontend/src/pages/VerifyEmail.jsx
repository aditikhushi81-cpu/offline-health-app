import { apiPost } from "../api";
import { useState, useEffect } from "react";
import AuthLayout from "../components/AuthLayout";

function VerifyEmail({ token, onDone }) {
    const [status, setStatus] = useState("working"); // working | ok | failed
    const [message, setMessage] = useState("");

    useEffect(() => {
        let active = true;
        apiPost("/auth/verify-email", { token })
            .then((data) => {
                if (!active) return;
                setStatus("ok");
                setMessage(data.message);
            })
            .catch((err) => {
                if (!active) return;
                setStatus("failed");
                setMessage(err.message || "Could not reach the server. Please try again with an internet connection.");
            });
        return () => { active = false; };
    }, [token]);

    return (
        <AuthLayout>
            <h1>Email verification</h1>
            {status === "working" && <p className="subtitle">Verifying your email...</p>}
            {status === "ok" && <p className="subtitle">{message}</p>}
            {status === "failed" && <div className="error-box">{message}</div>}
            {status !== "working" && (
                <button type="button" className="btn-primary" onClick={onDone}>
                    Go to sign in
                </button>
            )}
        </AuthLayout>
    );
}

export default VerifyEmail;