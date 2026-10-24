import { useState } from "react";
import { addVitalsLocal, syncNow } from "../db";
import { validateVitals } from "../vitalsValidation";

function VitalsModal({ patient, user, onClose }) {
  const [form, setForm] = useState({
    bloodPressure: "",
    temperature: "",
    pulse: "",
    weight: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    if (fieldErrors[field]) setFieldErrors({ ...fieldErrors, [field]: "" });
    // Any edit cancels a pending "Are you sure?" so values get re-checked
    if (warnings.length > 0) setWarnings([]);
  };

  const saveVitals = async () => {
    setSaving(true);
    try {
      await addVitalsLocal(
        patient.id,
        { ...form, bloodPressure: form.bloodPressure.trim() },
        user.id
      );
      syncNow();
      onClose();
    } catch (err) {
      setError("Could not save on this device.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const result = validateVitals(form);

    if (result.isEmpty && Object.keys(result.errors).length === 0) {
      setError("Enter at least one measurement.");
      return;
    }

    setFieldErrors(result.errors);
    if (Object.keys(result.errors).length > 0) return;

    // Unusual but possible values: ask before saving
    if (result.warnings.length > 0) {
      setWarnings(result.warnings);
      return;
    }

    await saveVitals();
  };

  const errStyle = { color: "#b91c1c", fontSize: "0.85rem", marginTop: 4 };
  const warnStyle = {
    background: "#fef3c7",
    border: "1px solid #f59e0b",
    color: "#92400e",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 12,
    fontSize: "0.9rem",
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Vitals: {patient.name}</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="row-2">
            <div className="field">
              <label htmlFor="v-bp">Blood pressure</label>
              <div className="input-wrap">
                <input id="v-bp" className="plain" value={form.bloodPressure} onChange={update("bloodPressure")} placeholder="120/80" />
              </div>
              {fieldErrors.bloodPressure && <div style={errStyle}>{fieldErrors.bloodPressure}</div>}
            </div>
            <div className="field">
              <label htmlFor="v-temp">Temperature (°C)</label>
              <div className="input-wrap">
                <input id="v-temp" className="plain" type="number" step="0.1" value={form.temperature} onChange={update("temperature")} placeholder="36.8" />
              </div>
              {fieldErrors.temperature && <div style={errStyle}>{fieldErrors.temperature}</div>}
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor="v-pulse">Pulse (bpm)</label>
              <div className="input-wrap">
                <input id="v-pulse" className="plain" type="number" value={form.pulse} onChange={update("pulse")} placeholder="72" />
              </div>
              {fieldErrors.pulse && <div style={errStyle}>{fieldErrors.pulse}</div>}
            </div>
            <div className="field">
              <label htmlFor="v-weight">Weight (kg)</label>
              <div className="input-wrap">
                <input id="v-weight" className="plain" type="number" step="0.1" value={form.weight} onChange={update("weight")} placeholder="60" />
              </div>
              {fieldErrors.weight && <div style={errStyle}>{fieldErrors.weight}</div>}
            </div>
          </div>

          <div className="field">
            <label htmlFor="v-notes">Notes (optional)</label>
            <div className="input-wrap">
              <textarea id="v-notes" className="plain-area" rows="3" value={form.notes} onChange={update("notes")} placeholder="Symptoms, observations..." />
            </div>
          </div>

          {warnings.length > 0 && (
            <div style={warnStyle}>
              <strong>Are you sure?</strong>
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              <div style={{ marginTop: 6 }}>Please check the reading before saving.</div>
            </div>
          )}

          <div className="modal-actions">
            {warnings.length > 0 ? (
              <>
                <button type="button" className="btn-secondary" onClick={() => setWarnings([])}>
                  Go back and check
                </button>
                <button type="button" className="btn-primary" disabled={saving} onClick={saveVitals}>
                  {saving ? "Saving..." : "Yes, save anyway"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save vitals"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default VitalsModal;