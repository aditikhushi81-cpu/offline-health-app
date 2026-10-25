import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";

function VitalsHistoryModal({ patient, onClose }) {
    const records =
        useLiveQuery(
            () => db.vitals.where("patientId").equals(patient.id).toArray(),
            [patient.id]
        ) || [];

    // Newest first
    const sorted = [...records].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <h2>Vitals history: {patient.name}</h2>
                    <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
                </div>

                {sorted.length === 0 ? (
                    <p className="no-results">No vitals recorded yet.</p>
                ) : (
                    <ul className="patient-list" style={{ maxHeight: "60vh", overflowY: "auto" }}>
                        {sorted.map((v) => (
                            <li key={v.id} className="patient-row">
                                <div className="patient-info">
                                    <strong>{new Date(v.recordedAt).toLocaleString()}</strong>
                                    <span className="vitals-line">
                                        {[
                                            v.bloodPressure ? `BP ${v.bloodPressure}` : null,
                                            v.temperature != null ? `${v.temperature}°C` : null,
                                            v.pulse != null ? `${v.pulse} bpm` : null,
                                            v.weight != null ? `${v.weight} kg` : null,
                                        ]
                                            .filter(Boolean)
                                            .join(" · ") || "No measurements"}
                                    </span>
                                    {v.notes && <span style={{ textTransform: "none" }}>Notes: {v.notes}</span>}
                                    {!v.isSynced && <span>Waiting to sync</span>}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}

export default VitalsHistoryModal;