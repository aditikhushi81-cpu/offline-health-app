const express = require("express");
const requireAuth = require("./middleware");
const logAudit = require("./audit");
const { validateField, validateGender, validatePatient } = require("./validation");
const { validateVitals, numOrNull } = require("./vitalsValidation");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = function (pool) {
    const router = express.Router();

    const EDITABLE = { name: "name", dob: "dob", gender: "gender", phone: "phone" };

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
                        "SELECT created_by FROM patients WHERE id = $1 AND is_deleted = false",
                        [p.id]
                    );
                    if (existing.rows.length === 0) continue;

                    const isOwner = existing.rows[0].created_by === req.user.id;
                    const isStaff = req.user.role === "doctor" || req.user.role === "admin";
                    if (!isOwner && !isStaff) {
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

                // Verification columns are NOT set here, so the database default
                // ('unverified') always applies to new patients.
                const inserted = await pool.query(
                    `INSERT INTO patients (id, name, dob, gender, phone, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
                    [
                        p.id,
                        p.name.trim(),
                        p.dob,
                        p.gender,
                        p.phone ? p.phone.trim() : null,
                        req.user.id,
                        p.createdAt || new Date().toISOString(),
                    ]
                );
                if (inserted.rows.length > 0) {
                    await logAudit(pool, req.user, "create", "patient", p.id, "Registered: " + p.name.trim());
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

                const exists = await pool.query("SELECT 1 FROM patients WHERE id = $1", [v.patientId]);
                if (exists.rows.length === 0) continue;

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

    // POST /api/sync/patients/:id/verify (doctors only, needs internet)
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
                "SELECT name, verification_status FROM patients WHERE id = $1 AND is_deleted = false",
                [id]
            );
            if (existing.rows.length === 0) {
                return res.status(404).json({ message: "Patient not found on the server." });
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

    // GET /api/sync/pull
    router.get("/pull", requireAuth, async (req, res) => {
        try {
            const seeAll = req.user.role === "doctor" || req.user.role === "admin";

            const patientsResult = seeAll
                ? await pool.query(
                    `SELECT id, name, dob, gender, phone, created_by, created_at, updated_at,
                            verification_status, verified_by, verified_at
             FROM patients WHERE is_deleted = false`
                )
                : await pool.query(
                    `SELECT id, name, dob, gender, phone, created_by, created_at, updated_at,
                            verification_status, verified_by, verified_at
             FROM patients WHERE is_deleted = false AND created_by = $1`,
                    [req.user.id]
                );

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

            res.json({ patients: patientsResult.rows, vitals: vitalsResult.rows });
        } catch (err) {
            console.error("Pull error:", err.message);
            res.status(500).json({ message: "Could not download records." });
        }
    });

    return router;
};