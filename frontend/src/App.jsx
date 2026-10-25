import { useState } from "react";
import "./App.css";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import ResendVerification from "./pages/ResendVerification";
import Dashboard from "./pages/Dashboard";

// Reads ?reset=TOKEN or ?verify=TOKEN from an email link, once, then cleans the address bar
function readLinkToken() {
  const params = new URLSearchParams(window.location.search);
  const reset = params.get("reset");
  const verify = params.get("verify");
  if (reset || verify) window.history.replaceState({}, "", window.location.pathname);
  if (reset) return { kind: "reset", token: reset };
  if (verify) return { kind: "verify", token: verify };
  return null;
}

function App() {
  const [link] = useState(readLinkToken);
  const [page, setPage] = useState(link ? link.kind : "login");
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setPage("login");
  };

  // Email-link screens are shown even if someone is logged in on this device
  if (page === "reset" && link) {
    return <ResetPassword token={link.token} onDone={() => setPage("login")} />;
  }
  if (page === "verify" && link) {
    return <VerifyEmail token={link.token} onDone={() => setPage("login")} />;
  }

  if (user) {
    return <Dashboard user={user} onLogout={handleLogout} />;
  }

  if (page === "register") return <Register onSwitch={() => setPage("login")} />;
  if (page === "forgot") return <ForgotPassword onBack={() => setPage("login")} />;
  if (page === "resend") return <ResendVerification onBack={() => setPage("login")} />;

  return (
    <Login
      onSwitch={() => setPage("register")}
      onForgot={() => setPage("forgot")}
      onResend={() => setPage("resend")}
      onAuth={setUser}
    />
  );
}

export default App;