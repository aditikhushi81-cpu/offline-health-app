import { useState } from "react";
import "./App.css";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";

// Read ?reset=TOKEN from the link in the email, once, then clean the address bar
function readResetToken() {
  const token = new URLSearchParams(window.location.search).get("reset");
  if (token) window.history.replaceState({}, "", window.location.pathname);
  return token;
}

function App() {
  const [resetToken] = useState(readResetToken);
  const [page, setPage] = useState(resetToken ? "reset" : "login");
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

  // The reset screen is shown even if someone is logged in on this device
  if (page === "reset" && resetToken) {
    return <ResetPassword token={resetToken} onDone={() => setPage("login")} />;
  }

  if (user) {
    return <Dashboard user={user} onLogout={handleLogout} />;
  }

  if (page === "register") return <Register onSwitch={() => setPage("login")} onAuth={setUser} />;
  if (page === "forgot") return <ForgotPassword onBack={() => setPage("login")} />;

  return (
    <Login
      onSwitch={() => setPage("register")}
      onForgot={() => setPage("forgot")}
      onAuth={setUser}
    />
  );
}

export default App;