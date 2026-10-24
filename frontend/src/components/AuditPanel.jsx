import { useState, useEffect } from "react";

function AuditPanel() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/audit", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setEntries(data.entries);
        setError("");
      } catch {
        setError("Activity log needs a connection to the server.");
      }
    };
    load();
  }, []);

  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <h2>Recent activity</h2>
      {error && <p className="no-results">{error}</p>}
      {!error && entries.length === 0 && <p className="no-results">No activity yet.</p>}
      <ul className="patient-list">
        {entries.map((e) => (
          <li key={e.id} className="patient-row">
            <div className="patient-info">
              <strong>
                {e.user_name} · {e.action} {e.entity}
                {e.patient_name ? ` (${e.patient_name})` : ""}
              </strong>
              <span style={{ textTransform: "none" }}>
                {e.details} · {new Date(e.created_at).toLocaleString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AuditPanel;