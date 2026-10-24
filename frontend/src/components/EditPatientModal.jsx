import { useState } from "react";
import { updatePatientLocal, syncNow } from "../db";
import { validatePatient } from "../validation";

function EditPatientModal({ patient, onClose }) {
  const [form, setForm] = useState({
    name: patient.name,
    dob: patient.dob,
    gender: patient.gender,
    phone: patient.phone || "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    if (fieldErrors[field]) setFieldErrors({ ...fieldErrors, [field]: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const cleaned = {
      ...form,
      name: form.name.trim().replace(/\s+/g, " "),
      phone: form.phone.trim(),
    };

    // Work out what actually changed
    const changes = {};
    if (cleaned.name !== patient.name) changes.name = cleaned.name;
    if (cleaned.dob !== patient.dob) changes.dob = cleaned.dob;
    if (cleaned.gender !== patient.gender) changes.gender = cleaned.gender;
    if (cleaned.phone !== (patient.phone || "")) changes.phone = cleaned.phone;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    // Validate only the fields that changed (old records may predate these rules)
    const allErrors = validatePatient(cleaned);
    const errors = {};
    for (const field of Object.keys(allErrors)) {
      if (field in changes) errors[field] = allErrors[field];
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

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

  const today = new Date().toISOString().split("T")[0];
  const errStyle = { color: "#b91c1c", fontSize: "0.85rem", marginTop: 4 };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Edit patient</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="e-name">Full name</label>
            <div className="input-wrap">
              <input id="e-name" className="plain" value={form.name} onChange={update("name")} />
            </div>
            {fieldErrors.name && <div style={errStyle}>{fieldErrors.name}</div>}
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor="e-dob">Date of birth</label>
              <div className="input-wrap">
                <input id="e-dob" className="plain" type="date" max={today} value={form.dob} onChange={update("dob")} />
              </div>
              {fieldErrors.dob && <div style={errStyle}>{fieldErrors.dob}</div>}
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
              <input id="e-phone" className="plain" type="tel" inputMode="numeric" value={form.phone} onChange={update("phone")} placeholder="e.g. 9876543210" />
            </div>
            {fieldErrors.phone && <div style={errStyle}>{fieldErrors.phone}</div>}
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