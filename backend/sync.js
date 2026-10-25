const express = require("express");
const requireAuth = require("./middleware");
const logAudit = require("./audit");
const { validateField, validateGender, validatePatient } = require("./validation");
const { validateVitals, numOrNull } = require("./vitalsValidation");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = function (pool) {
    const router = express.Router();

    const EDITABLE = { name: "name", dob: "dob", gender: "gender", phone: "phone" };

    // Who may see/change a patient: admin, the nurse who created it, or the assigned doctor.
    const canAccess = (user, row) =>
        user.role === "admin" ||
        row.created_by === user.id ||
        row.assigned_doctor_id === user.id;

    // Returns the doctor's name if this id belongs to a real doctor, otherwise null.
    const getDoctorName = async (id) => {
        if (!id || !UUID_RE.test(String(id))) return null;
        const r = await pool.query("SELECT name FROM users WHERE id = $1 AND role = 'doctor'", [id]);
        return r.rows.length > 0 ? r.rows[0].name : null;
    };

    // POST /api/sync/patients
    router.post("/patients", requireAuth, async (req, res) => {
        const { patients } = req.body;

        if (!Array.isArray(patients) || patients.length === 0) {
            return res.status(400).json({ message: "No patients to sync." });
        }
        if (patients.length > 100) {
            return res.status(400).json({ message: "Too many records in one batch." });
        }

        const syncedIds = [];

        try {
            for (const p of patients) {
                if (!p.id) continue;

                // ---------- EDIT: merge only the changed fields ----------
                if (p.changes) {
                    const existing = await pool.query(
                        "SELECT created_by, assigned_doctor_id FROM patients WHERE id = $1 AND is_deleted = false",
                        [p.id]
                    );
                    if (existing.rows.length === 0) continue;

                    if (!canAccess(req.user, existing.rows[0])) {
                        syncedIds.push(p.id);
                        continue;
                    }

                    const sets = [];
                    const values = [];
                    for (const [key, column] of Object.entries(EDITABLE)) {
                        if (p.changes[key] === undefined) continue;
                        let value = p.changes[key];
                        if (typeof value === "string") value = value.trim();
                        const fieldError = validateField(key, value);
                        if (fieldError) {
                            console.warn("Rejected edit", p.id, key, fieldError);
                            continue;
                        }
                        if (key === "phone" && value === "") value = null;
                        values.push(typeof value === "string" ? value.trim() : value);
                        sets.push(`${column} = $${values.length}`);
                    }

                    if (sets.length > 0) {
                        values.push(p.id);
                        await pool.query(
                            `UPDATE patients SET ${sets.join(", ")}, updated_at = now()
               WHERE id = $${values.length}`,
                            values
                        );
                        await logAudit(
                            pool, req.user, "update", "patient", p.id,
                            "Changed: " + Object.keys(p.changes).join(", ")
                        );
                    }
                    syncedIds.push(p.id);
                    continue;
                }

                // ---------- NEW PATIENT ----------
                const newErrors = validatePatient({ name: p.name, dob: p.dob, phone: p.phone });
                const genderError = validateGender(p.gender);
                if (genderError) newErrors.gender = genderError;
                if (Object.keys(newErrors).length > 0) {
                    console.warn("Rejected new patient", p.id, newErrors);
                    continue;
                }

                // Decide the assigned doctor.
                // 1) the one the app sent  2) a doctor adding a patient = themselves
                // 3) a nurse's default doctor from the database
                let doctorId = p.assignedDoctorId || null;
                if (!doctorId && req.user.role === "doctor") doctorId = req.user.id;
                if (!doctorId) {
                    const u = await pool.query("SELECT default_doctor_id FROM users WHERE id = $1", [req.user.id]);
                    doctorId = u.rows[0]?.default_doctor_id || null;
                }
                const doctorName = await getDoctorName(doctorId);
                if (!doctorName) {
                    console.warn("Rejected new patient (no valid doctor)", p.id);
                    continue;
                }

                // Verification columns are NOT set here, so the database default
                // ('unverified') always applies to new patients.
                const inserted = await pool.query(
                    `INSERT INTO patients (id, name, dob, gender, phone, created_by, assigned_doctor_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
                    [
                        p.id,
                        p.name.trim(),
                        p.dob,
                        p.gender,
                        p.phone ? p.phone.trim() : null,
                        req.user.id,
                        doctorId,
                        p.createdAt || new Date().toISOString(),
                    ]
                );
                if (inserted.rows.length > 0) {
                    await logAudit(
                        pool, req.user, "create", "patient", p.id,
                        "Registered: " + p.name.trim() + " (assigned to " + doctorName + ")"
                    );
                }
                syncedIds.push(p.id);
            }

            res.json({ syncedIds });
        } catch (err) {
            console.error("Sync error:", err.message);
            res.status(500).json({ message: "Sync failed. Will retry." });
        }
    });

    // POST /api/sync/vitals
    router.post("/vitals", requireAuth, async (req, res) => {
        const { vitals } = req.body;

        if (!Array.isArray(vitals) || vitals.length === 0) {
            return res.status(400).json({ message: "No vitals to sync." });
        }
        if (vitals.length > 100) {
            return res.status(400).json({ message: "Too many records in one batch." });
        }

        const syncedIds = [];

        try {
            for (const v of vitals) {
                if (!v.id || !v.patientId) continue;

                const vitalsErrors = validateVitals(v);
                if (Object.keys(vitalsErrors).length > 0) {
                    console.warn("Rejected vitals", v.id, vitalsErrors);
                    continue;
                }

                const exists = await pool.query(
                    "SELECT created_by, assigned_doctor_id FROM patients WHERE id = $1",
                    [v.patientId]
                );
                if (exists.rows.length === 0) continue;

                if (!canAccess(req.user, exists.rows[0])) {
                    console.warn("Vitals rejected: no access to patient", v.patientId);
                    syncedIds.push(v.id); // clear it from the outbox, it can never be accepted
                    continue;
                }

                const alreadyThere = await pool.query("SELECT 1 FROM vitals WHERE id = $1", [v.id]);

                await pool.query(
                    `INSERT INTO vitals (id, patient_id, blood_pressure, temperature, pulse, weight, notes, recorded_by, recorded_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           ON CONFLICT (id) DO UPDATE SET
             blood_pressure = EXCLUDED.blood_pressure,
             temperature = EXCLUDED.temperature,
             pulse = EXCLUDED.pulse,
             weight = EXCLUDED.weight,
             notes = EXCLUDED.notes,
             updated_at = now()`,
                    [
                        v.id,
                        v.patientId,
                        v.bloodPressure ? String(v.bloodPressure).trim() : null,
                        numOrNull(v.temperature),
                        numOrNull(v.pulse),
                        numOrNull(v.weight),
                        v.notes || null,
                        req.user.id,
                        v.recordedAt || new Date().toISOString(),
                    ]
                );
                if (alreadyThere.rows.length === 0) {
                    await logAudit(pool, req.user, "create", "vitals", v.id, "Vitals recorded for patient " + v.patientId);
                }
                syncedIds.push(v.id);
            }

            res.json({ syncedIds });
        } catch (err) {
            console.error("Vitals sync error:", err.message);
            res.status(500).json({ message: "Sync failed. Will retry." });
        }
    });

    // POST /api/sync/patients/:id/verify (assigned doctor only, needs internet)
    router.post("/patients/:id/verify", requireAuth, async (req, res) => {
        if (req.user.role !== "doctor") {
            return res.status(403).json({ message: "Only a doctor can verify a patient." });
        }

        const { id } = req.params;
        if (!UUID_RE.test(id)) {
            return res.status(400).json({ message: "Invalid patient id." });
        }

        try {
            const existing = await pool.query(
                "SELECT name, verification_status, assigned_doctor_id FROM patients WHERE id = $1 AND is_deleted = false",
                [id]
            );
            if (existing.rows.length === 0) {
                return res.status(404).json({ message: "Patient not found on the server." });
            }
            if (existing.rows[0].assigned_doctor_id !== req.user.id) {
                return res.status(403).json({ message: "This patient is assigned to another doctor." });
            }

            const updated = await pool.query(
                `UPDATE patients
         SET verification_status = 'verified', verified_by = $1, verified_at = now()
         WHERE id = $2 AND verification_status <> 'verified'
         RETURNING verification_status, verified_by, verified_at`,
                [req.user.id, id]
            );

            if (updated.rows.length === 0) {
                return res.json({ message: "Already verified.", alreadyVerified: true });
            }

            await logAudit(
                pool, req.user, "verify", "patient", id,
                "Marked verified: " + existing.rows[0].name
            );
            res.json({ verified: true, patient: updated.rows[0] });
        } catch (err) {
            console.error("Verify error:", err.message);
            res.status(500).json({ message: "Could not verify the patient." });
        }
    });

    // POST /api/sync/patients/:id/transfer (assigned doctor or admin, needs internet)
    // Body: { doctorId: "<uuid of the new doctor>" }
    router.post("/patients/:id/transfer", requireAuth, async (req, res) => {
        if (req.user.role !== "doctor" && req.user.role !== "admin") {
            return res.status(403).json({ message: "Only a doctor can transfer a patient." });
        }

        const { id } = req.params;
        const { doctorId } = req.body || {};
        if (!UUID_RE.test(id) || !UUID_RE.test(String(doctorId || ""))) {
            return res.status(400).json({ message: "Invalid patient or doctor id." });
        }

        try {
            const existing = await pool.query(
                `SELECT p.name, p.assigned_doctor_id, u.name AS old_doctor_name
                 FROM patients p
                 LEFT JOIN users u ON u.id = p.assigned_doctor_id
                 WHERE p.id = $1 AND p.is_deleted = false`,
                [id]
            );
            if (existing.rows.length === 0) {
                return res.status(404).json({ message: "Patient not found on the server." });
            }
            const row = existing.rows[0];

            if (req.user.role !== "admin" && row.assigned_doctor_id !== req.user.id) {
                return res.status(403).json({ message: "Only the assigned doctor can transfer this patient." });
            }
            if (row.assigned_doctor_id === doctorId) {
                return res.status(400).json({ message: "Patient is already assigned to that doctor." });
            }

            const newDoctorName = await getDoctorName(doctorId);
            if (!newDoctorName) {
                return res.status(400).json({ message: "The selected user is not a doctor." });
            }

            await pool.query(
                "UPDATE patients SET assigned_doctor_id = $1, updated_at = now() WHERE id = $2",
                [doctorId, id]
            );
            await logAudit(
                pool, req.user, "transfer", "patient", id,
                `Transferred ${row.name} from ${row.old_doctor_name || "no doctor"} to ${newDoctorName}`
            );
            res.json({ transferred: true, assignedDoctorId: doctorId, doctorName: newDoctorName });
        } catch (err) {
            console.error("Transfer error:", err.message);
            res.status(500).json({ message: "Could not transfer the patient." });
        }
    });

    // GET /api/sync/pull
    // Doctor: only patients assigned to them. Nurse: only patients she created.
    // Admin: everyone. Also returns the doctor list and the nurse's default doctor.
    router.get("/pull", requireAuth, async (req, res) => {
        try {
            const cols = `id, name, to_char(dob, 'YYYY-MM-DD') AS dob, gender, phone, created_by, assigned_doctor_id,
                          created_at, updated_at, verification_status, verified_by, verified_at,
                          (SELECT name FROM users WHERE users.id = patients.created_by) AS created_by_name`;
            let patientsResult;

            if (req.user.role === "admin") {
                patientsResult = await pool.query(
                    `SELECT ${cols} FROM patients WHERE is_deleted = false`
                );
            } else if (req.user.role === "doctor") {
                patientsResult = await pool.query(
                    `SELECT ${cols} FROM patients WHERE is_deleted = false AND assigned_doctor_id = $1`,
                    [req.user.id]
                );
            } else {
                patientsResult = await pool.query(
                    `SELECT ${cols} FROM patients WHERE is_deleted = false AND created_by = $1`,
                    [req.user.id]
                );
            }

            const ids = patientsResult.rows.map((p) => p.id);

            const vitalsResult =
                ids.length === 0
                    ? { rows: [] }
                    : await pool.query(
                        `SELECT id, patient_id, blood_pressure, temperature, pulse, weight, notes,
                      recorded_by, recorded_at, updated_at
               FROM vitals WHERE patient_id = ANY($1::uuid[])`,
                        [ids]
                    );

            const doctorsResult = await pool.query(
                "SELECT id, name FROM users WHERE role = 'doctor' ORDER BY name"
            );
            const me = await pool.query("SELECT default_doctor_id FROM users WHERE id = $1", [req.user.id]);

            res.json({
                patients: patientsResult.rows,
                vitals: vitalsResult.rows,
                doctors: doctorsResult.rows,
                defaultDoctorId: me.rows[0]?.default_doctor_id || null,
            });
        } catch (err) {
            console.error("Pull error:", err.message);
            res.status(500).json({ message: "Could not download records." });
        }
    });

    return router;
};