import Dexie from "dexie";
import { buildCsv } from "./csv";
export const db = new Dexie("ruralHealthDB");

db.version(1).stores({
    patients: "id, name, updatedAt, isSynced",
    vitals: "id, patientId, recordedAt, isSynced",
    syncOutbox: "id, createdAt, type",
});

// Version 2: adds verification status. The new fields are not indexed,
// so the table definitions stay the same; the upgrade fills old records.
db.version(2)
    .stores({
        patients: "id, name, updatedAt, isSynced",
        vitals: "id, patientId, recordedAt, isSynced",
        syncOutbox: "id, createdAt, type",
    })
    .upgrade((tx) =>
        tx.table("patients").toCollection().modify((p) => {
            if (!p.verificationStatus) p.verificationStatus = "unverified";
            if (p.verifiedBy === undefined) p.verifiedBy = null;
            if (p.verifiedAt === undefined) p.verifiedAt = null;
        })
    );
// Version 3: caches the doctor list and the logged-in user's default doctor
// so the doctor dropdown works offline.
db.version(3).stores({
    patients: "id, name, updatedAt, isSynced",
    vitals: "id, patientId, recordedAt, isSynced",
    syncOutbox: "id, createdAt, type",
    doctors: "id, name",
    meta: "key",
});

// Turns a date from the server (like "1990-05-09T18:30:00.000Z") into the correct
// local calendar day "YYYY-MM-DD". Plain "YYYY-MM-DD" values are returned unchanged.
function normalizeDob(value) {
    const text = String(value || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const d = new Date(text);
    if (Number.isNaN(d.getTime())) return text.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// Save a patient locally AND queue it for syncing, in one safe transaction
export async function addPatientLocal(data, userId) {
    const now = new Date().toISOString();
    const patient = {
        id: crypto.randomUUID(),
        name: data.name.trim(),
        dob: data.dob,
        gender: data.gender,
        phone: data.phone.trim(),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        isSynced: false,
        verificationStatus: "unverified",
        verifiedBy: null,
        verifiedAt: null,
        assignedDoctorId: data.assignedDoctorId || null,

    };

    await db.transaction("rw", db.patients, db.syncOutbox, async () => {
        await db.patients.add(patient);
        await db.syncOutbox.add({
            id: crypto.randomUUID(),
            type: "patient",
            action: "upsert",
            payload: patient,
            createdAt: now,
        });
    });

    return patient;
}

// Looks for an existing patient on this device with the same name + date of birth + phone.
// Name is compared ignoring upper/lower case and extra spaces. Works fully offline.
export async function findDuplicatePatient({ name, dob, phone }) {
    const cleanName = String(name || "").trim().replace(/\s+/g, " ");
    const cleanPhone = String(phone || "").trim();
    const cleanDob = normalizeDob(dob);

    const sameName = await db.patients.where("name").equalsIgnoreCase(cleanName).toArray();

    return (
        sameName.find(
            (p) =>
                normalizeDob(p.dob) === cleanDob &&
                String(p.phone || "").trim() === cleanPhone
        ) || null
    );
}

export async function addVitalsLocal(patientId, data, userId) {
    const now = new Date().toISOString();
    const vital = {
        id: crypto.randomUUID(),
        patientId,
        bloodPressure: data.bloodPressure.trim(),
        temperature: data.temperature === "" ? null : Number(data.temperature),
        pulse: data.pulse === "" ? null : Number(data.pulse),
        weight: data.weight === "" ? null : Number(data.weight),
        notes: data.notes.trim(),
        recordedBy: userId,
        recordedAt: now,
        updatedAt: now,
        isSynced: false,
    };

    await db.transaction("rw", db.vitals, db.syncOutbox, async () => {
        await db.vitals.add(vital);
        await db.syncOutbox.add({
            id: crypto.randomUUID(),
            type: "vital",
            action: "upsert",
            payload: vital,
            createdAt: now,
        });
    });

    return vital;
}

// Saves an edit locally and queues ONLY the changed fields for syncing
export async function updatePatientLocal(id, changes) {
    const now = new Date().toISOString();

    await db.transaction("rw", db.patients, db.syncOutbox, async () => {
        await db.patients.update(id, { ...changes, updatedAt: now, isSynced: false });
        await db.syncOutbox.add({
            id: crypto.randomUUID(),
            type: "patient",
            action: "update",
            payload: { id, changes, updatedAt: now },
            createdAt: now,
        });
    });
}

const API_URL = "http://localhost:5000/api";
let syncing = false;

// Sends all queued patients to the server. Returns how many were synced.
export async function syncNow() {
    if (syncing || !navigator.onLine) return 0;

    const token = localStorage.getItem("token");
    if (!token) return 0;

    syncing = true;
    try {
        const allTasks = (await db.syncOutbox.toArray()).sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt)
        );
        if (allTasks.length === 0) return 0;

        const patientTasks = allTasks.filter((t) => t.type === "patient");
        const vitalTasks = allTasks.filter((t) => t.type === "vital");
        let total = 0;

        // Patients first, because vitals refer to them
        if (patientTasks.length > 0) {
            const ids = await sendBatch("/sync/patients", "patients", patientTasks, token);
            if (ids === null) return 0;
            await db.transaction("rw", db.patients, db.syncOutbox, async () => {
                for (const task of patientTasks) {
                    if (ids.includes(task.payload.id)) {
                        await db.patients.update(task.payload.id, { isSynced: true });
                        await db.syncOutbox.delete(task.id);
                    }
                }
            });
            total += ids.length;
        }

        if (vitalTasks.length > 0) {
            const ids = await sendBatch("/sync/vitals", "vitals", vitalTasks, token);
            if (ids === null) return total;
            await db.transaction("rw", db.vitals, db.syncOutbox, async () => {
                for (const task of vitalTasks) {
                    if (ids.includes(task.payload.id)) {
                        await db.vitals.update(task.payload.id, { isSynced: true });
                        await db.syncOutbox.delete(task.id);
                    }
                }
            });
            total += ids.length;
        }

        return total;
    } catch (err) {
        // Network failed mid-way: nothing is deleted, so we simply retry later
        console.warn("Sync failed, will retry:", err.message);
        return 0;
    } finally {
        syncing = false;
    }
}

// Sends one batch. Returns the confirmed ids, or null if it failed / not logged in.
async function sendBatch(path, key, tasks, token) {
    const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [key]: tasks.map((t) => t.payload) }),
    });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error("Server rejected the sync");
    const data = await res.json();
    return data.syncedIds;
}

// Downloads records from the server and merges them into the local database.
export async function pullNow() {
    if (!navigator.onLine) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
        const res = await fetch(`${API_URL}/sync/pull`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const { patients, vitals, doctors, defaultDoctorId } = await res.json();

        // Cache the doctor list and default doctor for offline use
        if (Array.isArray(doctors)) {
            await db.transaction("rw", db.doctors, db.meta, async () => {
                await db.doctors.clear();
                await db.doctors.bulkPut(doctors);
                await db.meta.put({ key: "defaultDoctorId", value: defaultDoctorId || null });
            });
        }
        // Anything still waiting in the outbox is newer than the server copy: don't overwrite it
        const pendingIds = new Set((await db.syncOutbox.toArray()).map((t) => t.payload.id));

        await db.transaction("rw", db.patients, db.vitals, async () => {
            for (const p of patients) {
                if (pendingIds.has(p.id)) continue;
                await db.patients.put({
                    id: p.id,
                    name: p.name,
                    dob: normalizeDob(p.dob),
                    gender: p.gender,
                    phone: p.phone || "",
                    createdBy: p.created_by,
                    createdAt: p.created_at,
                    updatedAt: p.updated_at,
                    isSynced: true,
                    verificationStatus: p.verification_status || "unverified",
                    verifiedBy: p.verified_by || null,
                    verifiedAt: p.verified_at || null,
                    assignedDoctorId: p.assigned_doctor_id || null,
                    createdByName: p.created_by_name || "",
                });
            }
            for (const v of vitals) {
                if (pendingIds.has(v.id)) continue;
                await db.vitals.put({
                    id: v.id,
                    patientId: v.patient_id,
                    bloodPressure: v.blood_pressure || "",
                    temperature: v.temperature == null ? null : Number(v.temperature),
                    pulse: v.pulse,
                    weight: v.weight == null ? null : Number(v.weight),
                    notes: v.notes || "",
                    recordedBy: v.recorded_by,
                    recordedAt: v.recorded_at,
                    updatedAt: v.updated_at,
                    isSynced: true,
                });
            }
            // Remove synced local records that the server no longer sends to this user
            const serverPatientIds = new Set(patients.map((p) => p.id));
            const serverVitalIds = new Set(vitals.map((v) => v.id));

            const localPatients = await db.patients.toArray();
            for (const lp of localPatients) {
                if (lp.isSynced && !serverPatientIds.has(lp.id) && !pendingIds.has(lp.id)) {
                    await db.patients.delete(lp.id);
                }
            }
            const localVitals = await db.vitals.toArray();
            for (const lv of localVitals) {
                if (lv.isSynced && !serverVitalIds.has(lv.id) && !pendingIds.has(lv.id)) {
                    await db.vitals.delete(lv.id);
                }
            }
        });
    } catch (err) {
        console.warn("Pull failed, will retry:", err.message);
    }
}

// Reads the cached doctor list and default doctor (works offline).
export async function getDoctorsLocal() {
    const doctors = await db.doctors.orderBy("name").toArray();
    const meta = await db.meta.get("defaultDoctorId");
    return { doctors, defaultDoctorId: meta ? meta.value : null };
}

// Asks the server to move a patient to another doctor (needs internet).
export async function transferPatientRemote(id, doctorId) {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false, message: "Please log in again." };
    try {
        const res = await fetch(`${API_URL}/sync/patients/${id}/transfer`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ doctorId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, message: data.message || "Could not transfer the patient." };
        return { ok: true, doctorName: data.doctorName };
    } catch {
        return { ok: false, message: "Transfer needs an internet connection." };
    }
}

// Returns true only if the server really answers (not just "device has network")
export async function checkServer() {
    if (!navigator.onLine) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
        const res = await fetch(`${API_URL}/ping`, {
            cache: "no-store",
            signal: controller.signal,
        });
        return res.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

// Asks the server to mark a patient as verified (doctors only, needs internet).
// Returns { ok: true } or { ok: false, message }.
export async function verifyPatientRemote(id) {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false, message: "Please log in again." };
    try {
        const res = await fetch(`${API_URL}/sync/patients/${id}/verify`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, message: data.message || "Could not verify the patient." };
        return { ok: true };
    } catch {
        return { ok: false, message: "Verification needs an internet connection." };
    }
}

// Builds the CSV text for all patients on this device (works offline).
// Each patient gets one row with their latest vitals.
export async function buildPatientsCsv(currentUserId) {
    const patients = await db.patients.orderBy("name").toArray();
    const vitals = await db.vitals.toArray();
    const doctors = await db.doctors.toArray();

    const doctorName = (id) => {
        if (!id) return "Not assigned";
        const d = doctors.find((x) => x.id === id);
        return d ? d.name : "Unknown doctor";
    };

    // Latest vitals per patient
    const latest = {};
    for (const v of vitals) {
        const current = latest[v.patientId];
        if (!current || v.recordedAt > current.recordedAt) latest[v.patientId] = v;
    }

    // Only records this user may see: their own, or assigned to them
    const visible = patients.filter(
        (p) => p.createdBy === currentUserId || p.assignedDoctorId === currentUserId
    );

    const headers = [
        "Name", "Date of Birth", "Gender", "Phone", "Verification Status",
        "Assigned Doctor", "Blood Pressure", "Temperature", "Pulse", "Weight",
        "Notes", "Sync Status",
    ];

    const rows = visible.map((p) => {
        const v = latest[p.id];
        return [
            p.name,
            p.dob,
            p.gender,
            p.phone || "",
            p.verificationStatus === "verified" ? "Verified" : "Unverified",
            doctorName(p.assignedDoctorId),
            v ? v.bloodPressure : "",
            v && v.temperature != null ? v.temperature : "",
            v && v.pulse != null ? v.pulse : "",
            v && v.weight != null ? v.weight : "",
            v ? v.notes : "",
            p.isSynced ? "Synced" : "Waiting to sync",
        ];
    });

    return { csv: buildCsv(headers, rows), count: rows.length };
}