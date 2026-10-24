import Dexie from "dexie";

export const db = new Dexie("ruralHealthDB");

db.version(1).stores({
    patients: "id, name, updatedAt, isSynced",
    vitals: "id, patientId, recordedAt, isSynced",
    syncOutbox: "id, createdAt, type",
});

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
        const { patients, vitals } = await res.json();

        // Anything still waiting in the outbox is newer than the server copy: don't overwrite it
        const pendingIds = new Set((await db.syncOutbox.toArray()).map((t) => t.payload.id));

        await db.transaction("rw", db.patients, db.vitals, async () => {
            for (const p of patients) {
                if (pendingIds.has(p.id)) continue;
                await db.patients.put({
                    id: p.id,
                    name: p.name,
                    dob: String(p.dob).slice(0, 10),
                    gender: p.gender,
                    phone: p.phone || "",
                    createdBy: p.created_by,
                    createdAt: p.created_at,
                    updatedAt: p.updated_at,
                    isSynced: true,
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
        });
    } catch (err) {
        console.warn("Pull failed, will retry:", err.message);
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