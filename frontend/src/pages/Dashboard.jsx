import { useLiveQuery } from "dexie-react-hooks";

import AddPatientModal from "../components/AddPatientModal";
import { useState, useEffect } from "react";

import { LogoIcon } from "../components/AuthLayout";
import { db, syncNow, pullNow, checkServer } from "../db";
import useConnection from "../useConnection";
import VitalsModal from "../components/VitalsModal";
import EditPatientModal from "../components/EditPatientModal";
import AuditPanel from "../components/AuditPanel";

function Dashboard({ user, onLogout }) {
    const isOnline = useConnection();
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState("");
    const [showAdd, setShowAdd] = useState(false);
    const [vitalsFor, setVitalsFor] = useState(null);
    const [editing, setEditing] = useState(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const vitalsList = useLiveQuery(() => db.vitals.orderBy("recordedAt").reverse().toArray(), []) || [];
    const latestVitals = (patientId) => vitalsList.find((v) => v.patientId === patientId);
    const patients = useLiveQuery(() => db.patients.orderBy("updatedAt").reverse().toArray(), []) || [];
    const pending = useLiveQuery(() => db.syncOutbox.count(), []) || 0;

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


    // Auto-sync: on open, when the connection returns, and every 30 seconds
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
                                ? "Showing patients from all health workers."
                                : "Here's an overview of your patient records."}
                        </p>
                    </div>
                    <button className="btn-add" onClick={() => setShowAdd(true)}>
                        + Add patient
                    </button>
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
                            {visiblePatients.map((p) => (
                                <li key={p.id} className="patient-row">
                                    <div className="avatar small">{p.name.charAt(0).toUpperCase()}</div>
                                    <div className="patient-info">
                                        <strong>{p.name}</strong>
                                        <span>
                                            {ageOf(p.dob)} yrs · {p.gender}
                                            {p.phone ? ` · ${p.phone}` : ""}
                                        </span>
                                        {latestVitals(p.id) && (
                                            <span className="vitals-line">
                                                {latestVitals(p.id).bloodPressure && `BP ${latestVitals(p.id).bloodPressure}`}
                                                {latestVitals(p.id).temperature != null && ` · ${latestVitals(p.id).temperature}°C`}
                                                {latestVitals(p.id).pulse != null && ` · ${latestVitals(p.id).pulse} bpm`}
                                                {latestVitals(p.id).weight != null && ` · ${latestVitals(p.id).weight} kg`}
                                            </span>
                                        )}
                                    </div>
                                    <button className="btn-vitals" onClick={() => setEditing(p)}>Edit</button>
                                    <button className="btn-vitals" onClick={() => setVitalsFor(p)}>Record vitals</button>
                                    <span className={`sync-pill ${p.isSynced ? "synced" : "pending"}`}>
                                        {p.isSynced ? "Synced" : "Waiting to sync"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {visiblePatients.length === 0 && (
                        <p className="no-results">No patients match your search.</p>
                    )}
                </>
                    )}
            </section>
            {user.role === "doctor" && <AuditPanel />}
        </main>
            { showAdd && <AddPatientModal user={user} onClose={() => setShowAdd(false)} /> }
    { vitalsFor && <VitalsModal patient={vitalsFor} user={user} onClose={() => setVitalsFor(null)} /> }
    { editing && <EditPatientModal patient={editing} onClose={() => setEditing(null)} /> }
        </div >
    );
}

export default Dashboard;