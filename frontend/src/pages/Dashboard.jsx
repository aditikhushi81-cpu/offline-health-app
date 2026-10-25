import { useLiveQuery } from "dexie-react-hooks";
import { useState, useEffect } from "react";

import AddPatientModal from "../components/AddPatientModal";
import { LogoIcon } from "../components/AuthLayout";
import { db, syncNow, pullNow, checkServer, verifyPatientRemote, buildPatientsCsv } from "../db";
import { downloadCsv } from "../csv";
import useConnection from "../useConnection";
import VitalsModal from "../components/VitalsModal";
import EditPatientModal from "../components/EditPatientModal";
import TransferModal from "../components/TransferModal";
import AuditPanel from "../components/AuditPanel";
import VitalsHistoryModal from "../components/VitalsHistoryModal";

const badgeBase = {
    display: "inline-block",
    marginLeft: 8,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: "0.72rem",
    fontWeight: 600,
    verticalAlign: "middle",
};
const verifiedBadge = { ...badgeBase, background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
const unverifiedBadge = { ...badgeBase, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" };

function Dashboard({ user, onLogout }) {
    const isOnline = useConnection();
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState("");
    const [showAdd, setShowAdd] = useState(false);
    const [vitalsFor, setVitalsFor] = useState(null);
    const [editing, setEditing] = useState(null);
    const [transferFor, setTransferFor] = useState(null);
    const [historyFor, setHistoryFor] = useState(null);
    const [showExport, setShowExport] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [verifyingId, setVerifyingId] = useState(null);
    const [verifyMsg, setVerifyMsg] = useState("");
    const [auditKey, setAuditKey] = useState(0);

    const vitalsList = useLiveQuery(() => db.vitals.orderBy("recordedAt").reverse().toArray(), []) || [];
    const latestVitals = (patientId) => vitalsList.find((v) => v.patientId === patientId);
    const patients = useLiveQuery(() => db.patients.orderBy("updatedAt").reverse().toArray(), []) || [];
    const doctorList = useLiveQuery(() => db.doctors.orderBy("name").toArray(), []) || [];
    const pending = useLiveQuery(() => db.syncOutbox.count(), []) || 0;

    const doctorName = (id) => {
        if (!id) return "Not assigned";
        const d = doctorList.find((x) => x.id === id);
        return d ? d.name : "Unknown doctor";
    };

    const ageOf = (dob) => {
        const years = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
        return years;
    };

    const visiblePatients = patients.filter((p) => {
        const q = search.trim().toLowerCase();
        const matches =
            q === "" ||
            p.name.toLowerCase().includes(q) ||
            (p.phone || "").includes(q);
        const passes = filter === "all" || !p.isSynced;
        return matches && passes;
    });

    // Auto-sync whenever the server becomes reachable, then every 30 seconds
    useEffect(() => {
        if (!isOnline) return;
        const run = async () => {
            await syncNow();
            await pullNow();
        };
        run();
        const timer = setInterval(run, 30000);
        return () => clearInterval(timer);
    }, [isOnline]);

    const handleSyncNow = async () => {
        setSyncing(true);
        setSyncMsg("");
        const reachable = await checkServer();
        if (!reachable) {
            setSyncMsg("Server not reachable. Your data is safe and will sync automatically.");
            setSyncing(false);
            return;
        }
        await syncNow();
        await pullNow();
        const left = await db.syncOutbox.count();
        setSyncMsg(
            left === 0
                ? "All synced at " + new Date().toLocaleTimeString()
                : left + " item(s) still waiting. Will retry automatically."
        );
        setSyncing(false);
    };

    const handleVerify = async (patient) => {
        setVerifyMsg("");
        if (!isOnline) {
            setVerifyMsg("Verification needs an internet connection.");
            return;
        }
        setVerifyingId(patient.id);
        const result = await verifyPatientRemote(patient.id);
        if (result.ok) {
            await pullNow();
            setAuditKey((k) => k + 1);
            setVerifyMsg(`${patient.name} marked as verified.`);
        } else {
            setVerifyMsg(result.message);
        }
        setVerifyingId(null);
    };

    const handleTransferDone = async (message) => {
        setTransferFor(null);
        await pullNow();
        setAuditKey((k) => k + 1);
        setVerifyMsg(message);
    };

    // Builds the CSV from IndexedDB (no internet needed) and downloads it
    const handleExport = async () => {
        setExporting(true);
        try {
            const { csv, count } = await buildPatientsCsv(user.id);
            const d = new Date();
            const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            downloadCsv(`patients-${stamp}.csv`, csv);
            setVerifyMsg(`Exported ${count} patient(s). Keep the file safe and delete it after use.`);
            setShowExport(false);
        } catch (err) {
            console.error(err);
            setVerifyMsg("Could not create the export file.");
            setShowExport(false);
        } finally {
            setExporting(false);
        }
    };

    const roleLabel = user.role === "doctor" ? "Doctor" : "Nurse / Health worker";
    const initial = user.name ? user.name.charAt(0).toUpperCase() : "?";

    return (
        <div className="dash">
            <header className="dash-header">
                <div className="dash-brand">
                    <LogoIcon size={26} />
                    <span>Rural Health Records</span>
                </div>

                <div className="dash-right">
                    <div className={`status-badge static ${isOnline ? "online" : "offline"}`}>
                        <span className="pulse" />
                        {isOnline ? "Online" : "Offline"}
                    </div>

                    <div className="user-chip">
                        <div className="avatar">{initial}</div>
                        <div className="user-info">
                            <strong>{user.name}</strong>
                            <span>{roleLabel}</span>
                        </div>
                    </div>

                    <button className="btn-logout" onClick={onLogout}>Log out</button>
                </div>
            </header>

            <main className="dash-main">
                <div className="dash-title">
                    <div>
                        <h1>Hello, {user.name.split(" ")[0]}</h1>
                        <p>
                            {user.role === "doctor"
                                ? "Showing patients assigned to you."
                                : "Here's an overview of your patient records."}
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn-secondary" onClick={() => setShowExport(true)}>
                            Export CSV
                        </button>
                        <button className="btn-add" onClick={() => setShowAdd(true)}>
                            + Add patient
                        </button>
                    </div>
                </div>

                <div className="stats">
                    <div className="stat-card">
                        <span className="stat-label">Total patients</span>
                        <span className="stat-value">{patients.length}</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Waiting to sync</span>
                        <span className="stat-value">{pending}</span>
                        <button className="btn-sync" onClick={handleSyncNow} disabled={syncing}>
                            {syncing ? "Syncing..." : "Sync now"}
                        </button>
                        {syncMsg && <span className="sync-msg">{syncMsg}</span>}
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Connection</span>
                        <span className={`stat-value small ${isOnline ? "ok" : "bad"}`}>
                            {isOnline ? "Connected" : "Working offline"}
                        </span>
                    </div>
                </div>

                <section className="panel">
                    <h2>Patients</h2>
                    <div className="toolbar">
                        <input
                            className="search-input"
                            type="search"
                            placeholder="Search by name or phone..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <div className="filter-pills">
                            <button
                                className={`pill ${filter === "all" ? "active" : ""}`}
                                onClick={() => setFilter("all")}
                            >
                                All ({patients.length})
                            </button>
                            <button
                                className={`pill ${filter === "pending" ? "active" : ""}`}
                                onClick={() => setFilter("pending")}
                            >
                                Waiting to sync
                            </button>
                        </div>
                    </div>

                    {verifyMsg && <p className="sync-msg" style={{ margin: "8px 0" }}>{verifyMsg}</p>}

                    {patients.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">+</div>
                            <h3>No patients yet</h3>
                            <p>
                                Patients you register will appear here. They are saved on this
                                device first, so you can keep working even without internet.
                            </p>
                        </div>
                    ) : (
                        <>
                            <ul className="patient-list">
                                {visiblePatients.map((p) => {
                                    const isVerified = p.verificationStatus === "verified";
                                    const isMine = user.role === "doctor" && p.assignedDoctorId === user.id;
                                    const canVerify = isMine && !isVerified && p.isSynced;
                                    const canTransfer = isMine && p.isSynced;
                                    return (
                                        <li key={p.id} className="patient-row">
                                            <div className="avatar small">{p.name.charAt(0).toUpperCase()}</div>
                                            <div className="patient-info">
                                                <strong>
                                                    {p.name}
                                                    <span
                                                        style={isVerified ? verifiedBadge : unverifiedBadge}
                                                        title={
                                                            isVerified && p.verifiedAt
                                                                ? "Verified on " + new Date(p.verifiedAt).toLocaleString()
                                                                : "Not yet verified by a doctor"
                                                        }
                                                    >
                                                        {isVerified ? "Verified" : "Unverified"}
                                                    </span>
                                                </strong>
                                                <span>
                                                    {ageOf(p.dob)} yrs · {p.gender}
                                                    {p.phone ? ` · ${p.phone}` : ""}
                                                </span>
                                                <span>Doctor: {doctorName(p.assignedDoctorId)}</span>
                                                {latestVitals(p.id) && (
                                                    <span className="vitals-line">
                                                        {latestVitals(p.id).bloodPressure && `BP ${latestVitals(p.id).bloodPressure}`}
                                                        {latestVitals(p.id).temperature != null && ` · ${latestVitals(p.id).temperature}°C`}
                                                        {latestVitals(p.id).pulse != null && ` · ${latestVitals(p.id).pulse} bpm`}
                                                        {latestVitals(p.id).weight != null && ` · ${latestVitals(p.id).weight} kg`}
                                                    </span>
                                                )}
                                            </div>
                                            {canVerify && (
                                                <button
                                                    className="btn-vitals"
                                                    onClick={() => handleVerify(p)}
                                                    disabled={verifyingId === p.id || !isOnline}
                                                    title={isOnline ? "Mark as verified after checking in person or against an ID" : "Needs an internet connection"}
                                                >
                                                    {verifyingId === p.id ? "Verifying..." : "Mark verified"}
                                                </button>
                                            )}
                                            {canTransfer && (
                                                <button
                                                    className="btn-vitals"
                                                    onClick={() => setTransferFor(p)}
                                                    disabled={!isOnline}
                                                    title={isOnline ? "Transfer to another doctor" : "Needs an internet connection"}
                                                >
                                                    Transfer
                                                </button>
                                            )}
                                            <button className="btn-vitals" onClick={() => setEditing(p)}>Edit</button>
                                            <button className="btn-vitals" onClick={() => setVitalsFor(p)}>Record vitals</button>
                                            <button className="btn-vitals" onClick={() => setHistoryFor(p)}>History</button>
                                            <span className={`sync-pill ${p.isSynced ? "synced" : "pending"}`}>
                                                {p.isSynced ? "Synced" : "Waiting to sync"}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                            {visiblePatients.length === 0 && (
                                <p className="no-results">No patients match your search.</p>
                            )}
                        </>
                    )}
                </section>

                {user.role === "doctor" && <AuditPanel refreshKey={auditKey} />}
            </main>

            {showAdd && <AddPatientModal user={user} onClose={() => setShowAdd(false)} />}
            {vitalsFor && <VitalsModal patient={vitalsFor} user={user} onClose={() => setVitalsFor(null)} />}
            {editing && <EditPatientModal patient={editing} onClose={() => setEditing(null)} />}
            {transferFor && (
                <TransferModal
                    patient={transferFor}
                    doctors={doctorList}
                    currentDoctorId={user.id}
                    onClose={() => setTransferFor(null)}
                    onDone={handleTransferDone}
                />
            )}
            {historyFor && <VitalsHistoryModal patient={historyFor} onClose={() => setHistoryFor(null)} />}
            {showExport && (
                <div className="modal-backdrop" onClick={() => setShowExport(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-head">
                            <h2>Export CSV</h2>
                            <button type="button" className="modal-x" onClick={() => setShowExport(false)} aria-label="Close">×</button>
                        </div>
                        <div
                            style={{
                                background: "#fef3c7",
                                border: "1px solid #f59e0b",
                                color: "#92400e",
                                borderRadius: 8,
                                padding: "10px 12px",
                                marginBottom: 12,
                                fontSize: "0.9rem",
                            }}
                        >
                            <strong>Warning: sensitive health data.</strong>
                            <div style={{ marginTop: 6 }}>
                                This file is <strong>not encrypted</strong>. Keep it in a safe place,
                                do not share it, and delete it after use.
                            </div>
                        </div>
                        <p style={{ margin: "0 0 12px" }}>
                            It contains only the records you can see, taken from this device, and works without internet.
                        </p>
                        <div className="modal-actions">
                            <button type="button" className="btn-secondary" onClick={() => setShowExport(false)}>Cancel</button>
                            <button type="button" className="btn-primary" disabled={exporting} onClick={handleExport}>
                                {exporting ? "Preparing..." : "I understand, download"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;