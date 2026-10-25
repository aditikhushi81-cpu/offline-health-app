import { useState } from "react";
import { transferPatientRemote } from "../db";

function TransferModal({ patient, doctors, currentDoctorId, onClose, onDone }) {
    const options = doctors.filter((d) => d.id !== currentDoctorId);
    const [doctorId, setDoctorId] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const handleTransfer = async () => {
        setError("");
        if (!doctorId) {
            setError("Please choose a doctor.");
            return;
        }
        setSaving(true);
        const result = await transferPatientRemote(patient.id, doctorId);
        setSaving(false);
        if (result.ok) {
            onDone(`${patient.name} transferred to ${result.doctorName}.`);
        } else {
            setError(result.message);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <h2>Transfer: {patient.name}</h2>
                    <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
                </div>

                {error && <div className="error-box">{error}</div>}

                <p style={{ margin: "0 0 12px" }}>
                    After the transfer, this patient will no longer appear in your list.
                    Transfers need an internet connection and are recorded in the audit log.
                </p>

                <div className="field">
                    <label htmlFor="t-doctor">New doctor</label>
                    <div className="input-wrap">
                        <select id="t-doctor" className="plain" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                            <option value="">Select a doctor</option>
                            {options.map((d) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                    {options.length === 0 && (
                        <div style={{ color: "#b91c1c", fontSize: "0.85rem", marginTop: 4 }}>
                            No other doctor available.
                        </div>
                    )}
                </div>

                <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn-primary" disabled={saving || options.length === 0} onClick={handleTransfer}>
                        {saving ? "Transferring..." : "Transfer patient"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default TransferModal;