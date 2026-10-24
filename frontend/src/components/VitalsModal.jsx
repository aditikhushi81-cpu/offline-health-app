import { useState } from "react";
import { addVitalsLocal, syncNow } from "../db";

function VitalsModal({ patient, user, onClose }) {
  const [form, setForm] = useState({
    bloodPressure: "",
    temperature: "",
    pulse: "",
    weight: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.bloodPressure && !/^\d{2,3}\/\d{2,3}$/.test(form.bloodPressure.trim())) {
      setError("Blood pressure should look like 120/80.");
      return;
    }
    if (form.temperature !== "" && (form.temperature < 30 || form.temperature > 45)) {
      setError("Temperature must be between 30 and 45 °C.");
      return;
    }
    if (form.pulse !== "" && (form.pulse < 20 || form.pulse > 250)) {
      setError("Pulse must be between 20 and 250 bpm.");
      return;
    }
    if (form.weight !== "" && (form.weight < 1 || form.weight > 400)) {
      setError("Weight must be between 1 and 400 kg.");
      return;
    }
    if (!form.bloodPressure && form.temperature === "" && form.pulse === "" && form.weight === "") {
      setError("Enter at least one measurement.");
      return;
    }

    setSaving(true);
    try {
      await addVitalsLocal(patient.id, form, user.id);
      syncNow();
      onClose();
    } catch (err) {
      setError("Could not save on this device.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Vitals: {patient.name}</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="row-2">
            <div className="field">
              <label htmlFor="v-bp">Blood pressure</label>
              <div className="input-wrap">
                <input id="v-bp" className="plain" value={form.bloodPressure} onChange={update("bloodPressure")} placeholder="120/80" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="v-temp">Temperature (°C)</label>
              <div className="input-wrap">
                <input id="v-temp" className="plain" type="number" step="0.1" value={form.temperature} onChange={update("temperature")} placeholder="36.8" />
              </div>
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor="v-pulse">Pulse (bpm)</label>
              <div className="input-wrap">
                <input id="v-pulse" className="plain" type="number" value={form.pulse} onChange={update("pulse")} placeholder="72" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="v-weight">Weight (kg)</label>
              <div className="input-wrap">
                <input id="v-weight" className="plain" type="number" step="0.1" value={form.weight} onChange={update("weight")} placeholder="60" />
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="v-notes">Notes (optional)</label>
            <div className="input-wrap">
              <textarea id="v-notes" className="plain-area" rows="3" value={form.notes} onChange={update("notes")} placeholder="Symptoms, observations..." />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save vitals"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default VitalsModal;