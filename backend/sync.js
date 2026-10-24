const express = require("express");
const requireAuth = require("./middleware");
const logAudit = require("./audit");

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
            if (key === "name" && String(value).trim().length < 2) continue;
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
        if (!p.name || !p.dob || !p.gender) continue;

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
            p.phone || null,
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
            v.bloodPressure || null,
            v.temperature ?? null,
            v.pulse ?? null,
            v.weight ?? null,
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

  // GET /api/sync/pull
  router.get("/pull", requireAuth, async (req, res) => {
    try {
      const seeAll = req.user.role === "doctor" || req.user.role === "admin";

      const patientsResult = seeAll
        ? await pool.query(
            `SELECT id, name, dob, gender, phone, created_by, created_at, updated_at
             FROM patients WHERE is_deleted = false`
          )
        : await pool.query(
            `SELECT id, name, dob, gender, phone, created_by, created_at, updated_at
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