import { useState } from "react";
import "./App.css";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";

function App() {
  const [page, setPage] = useState("login");
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

  if (user) {
    return <Dashboard user={user} onLogout={handleLogout} />;
  }

  return page === "login" ? (
    <Login onSwitch={() => setPage("register")} onAuth={setUser} />
  ) : (
    <Register onSwitch={() => setPage("login")} onAuth={setUser} />
  );
}

export default App;