import { useState } from "react";
import { updatePatientLocal, syncNow } from "../db";

function EditPatientModal({ patient, onClose }) {
  const [form, setForm] = useState({
    name: patient.name,
    dob: patient.dob,
    gender: patient.gender,
    phone: patient.phone || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.name.trim().length < 2) {
      setError("Please enter the patient's full name.");
      return;
    }
    if (new Date(form.dob) > new Date()) {
      setError("Date of birth cannot be in the future.");
      return;
    }
    if (form.phone && !/^[0-9+\-\s]{7,15}$/.test(form.phone.trim())) {
      setError("Please enter a valid phone number.");
      return;
    }

    // Send only what actually changed
    const changes = {};
    if (form.name.trim() !== patient.name) changes.name = form.name.trim();
    if (form.dob !== patient.dob) changes.dob = form.dob;
    if (form.gender !== patient.gender) changes.gender = form.gender;
    if (form.phone.trim() !== (patient.phone || "")) changes.phone = form.phone.trim();

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await updatePatientLocal(patient.id, changes);
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
          <h2>Edit patient</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="e-name">Full name</label>
            <div className="input-wrap">
              <input id="e-name" className="plain" value={form.name} onChange={update("name")} required />
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor="e-dob">Date of birth</label>
              <div className="input-wrap">
                <input id="e-dob" className="plain" type="date" value={form.dob} onChange={update("dob")} required />
              </div>
            </div>
            <div className="field">
              <label htmlFor="e-gender">Gender</label>
              <div className="input-wrap">
                <select id="e-gender" className="plain" value={form.gender} onChange={update("gender")}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="e-phone">Phone (optional)</label>
            <div className="input-wrap">
              <input id="e-phone" className="plain" value={form.phone} onChange={update("phone")} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditPatientModal;