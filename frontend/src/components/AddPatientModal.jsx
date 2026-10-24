import { useState } from "react";
import { addPatientLocal, syncNow } from "../db";
function AddPatientModal({ user, onClose }) {
    const [form, setForm] = useState({ name: "", dob: "", gender: "female", phone: "" });
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

        setSaving(true);
        try {
            await addPatientLocal(form, user.id);
            syncNow();
            onClose();
        } catch (err) {
            setError("Could not save the patient on this device.");
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <h2>Add patient</h2>
                    <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
                </div>

                {error && <div className="error-box">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="field">
                        <label htmlFor="p-name">Full name</label>
                        <div className="input-wrap">
                            <input id="p-name" className="plain" value={form.name} onChange={update("name")} placeholder="Patient's full name" required />
                        </div>
                    </div>

                    <div className="row-2">
                        <div className="field">
                            <label htmlFor="p-dob">Date of birth</label>
                            <div className="input-wrap">
                                <input id="p-dob" className="plain" type="date" value={form.dob} onChange={update("dob")} required />
                            </div>
                        </div>
                        <div className="field">
                            <label htmlFor="p-gender">Gender</label>
                            <div className="input-wrap">
                                <select id="p-gender" className="plain" value={form.gender} onChange={update("gender")}>
                                    <option value="female">Female</option>
                                    <option value="male">Male</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="field">
                        <label htmlFor="p-phone">Phone (optional)</label>
                        <div className="input-wrap">
                            <input id="p-phone" className="plain" value={form.phone} onChange={update("phone")} placeholder="e.g. 9876543210" />
                        </div>
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={saving}>
                            {saving ? "Saving..." : "Save patient"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddPatientModal;