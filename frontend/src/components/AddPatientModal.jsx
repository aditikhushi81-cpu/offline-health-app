import { useState, useEffect } from "react";
import { addPatientLocal, findDuplicatePatient, getDoctorsLocal, syncNow } from "../db";
import { validatePatient } from "../validation";

function AddPatientModal({ user, onClose }) {
    const [form, setForm] = useState({ name: "", dob: "", gender: "female", phone: "", assignedDoctorId: "" });
    const [doctors, setDoctors] = useState([]);
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState({});
    const [duplicate, setDuplicate] = useState(null); // { existing, data }
    const [saving, setSaving] = useState(false);

    // Load the cached doctor list (works offline) and pre-fill the default doctor
    useEffect(() => {
        let active = true;
        (async () => {
            const { doctors: list, defaultDoctorId } = await getDoctorsLocal();
            if (!active) return;
            setDoctors(list);
            let chosen = "";
            if (user.role === "doctor") chosen = user.id; // a doctor adds patients to themselves by default
            else if (defaultDoctorId && list.some((d) => d.id === defaultDoctorId)) chosen = defaultDoctorId;
            else if (list.length === 1) chosen = list[0].id;
            setForm((f) => ({ ...f, assignedDoctorId: f.assignedDoctorId || chosen }));
        })();
        return () => { active = false; };
    }, [user.id, user.role]);

    const update = (field) => (e) => {
        setForm({ ...form, [field]: e.target.value });
        if (fieldErrors[field]) setFieldErrors({ ...fieldErrors, [field]: "" });
        if (duplicate) setDuplicate(null);
    };

    const savePatient = async (data) => {
        setSaving(true);
        try {
            await addPatientLocal(data, user.id);
            syncNow();
            onClose();
        } catch (err) {
            setError("Could not save the patient on this device.");
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const cleaned = {
            ...form,
            name: form.name.trim().replace(/\s+/g, " "),
            phone: form.phone.trim(),
        };

        const errors = validatePatient(cleaned);
        if (!cleaned.assignedDoctorId) errors.assignedDoctorId = "Please choose a doctor.";
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        try {
            const existing = await findDuplicatePatient(cleaned);
            if (existing) {
                setDuplicate({ existing, data: cleaned });
                return;
            }
        } catch (err) {
            console.error("Duplicate check failed:", err);
        }

        await savePatient(cleaned);
    };

    const today = new Date().toISOString().split("T")[0];
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
                    <h2>Add patient</h2>
                    <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
                </div>

                {error && <div className="error-box">{error}</div>}

                <form onSubmit={handleSubmit} noValidate>
                    <div className="field">
                        <label htmlFor="p-name">Full name</label>
                        <div className="input-wrap">
                            <input id="p-name" className="plain" value={form.name} onChange={update("name")} placeholder="Patient's full name" />
                        </div>
                        {fieldErrors.name && <div style={errStyle}>{fieldErrors.name}</div>}
                    </div>

                    <div className="row-2">
                        <div className="field">
                            <label htmlFor="p-dob">Date of birth</label>
                            <div className="input-wrap">
                                <input id="p-dob" className="plain" type="date" max={today} value={form.dob} onChange={update("dob")} />
                            </div>
                            {fieldErrors.dob && <div style={errStyle}>{fieldErrors.dob}</div>}
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
                            <input id="p-phone" className="plain" type="tel" inputMode="numeric" maxLength={10} value={form.phone} onChange={update("phone")} placeholder="e.g. 9876543210" />
                        </div>
                        {fieldErrors.phone && <div style={errStyle}>{fieldErrors.phone}</div>}
                    </div>

                    <div className="field">
                        <label htmlFor="p-doctor">Assigned doctor</label>
                        <div className="input-wrap">
                            <select id="p-doctor" className="plain" value={form.assignedDoctorId} onChange={update("assignedDoctorId")}>
                                <option value="">Select a doctor</option>
                                {doctors.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                        {doctors.length === 0 && (
                            <div style={errStyle}>Doctor list not downloaded yet. Connect once to load it.</div>
                        )}
                        {fieldErrors.assignedDoctorId && <div style={errStyle}>{fieldErrors.assignedDoctorId}</div>}
                    </div>

                    {duplicate && (
                        <div style={warnStyle}>
                            <strong>This patient may already be registered.</strong>
                            <div style={{ marginTop: 6 }}>
                                Existing record: {duplicate.existing.name}, born {duplicate.existing.dob}
                                {duplicate.existing.phone ? `, phone ${duplicate.existing.phone}` : ", no phone"}.
                            </div>
                        </div>
                    )}

                    <div className="modal-actions">
                        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                        {duplicate ? (
                            <button type="button" className="btn-primary" disabled={saving} onClick={() => savePatient(duplicate.data)}>
                                {saving ? "Saving..." : "Save anyway"}
                            </button>
                        ) : (
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving ? "Saving..." : "Save patient"}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddPatientModal;