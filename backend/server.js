require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const authRoutes = require("./auth");
const syncRoutes = require("./sync");
const auditRoutes = require("./audit-routes");

const app = express();

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }));
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
app.use("/api/auth", authRoutes(pool));
app.use("/api/sync", syncRoutes(pool));
app.use("/api/audit", auditRoutes(pool));

// Health check: confirms the server is running and can reach the database
app.get("/api/ping", (req, res) => res.json({ ok: true }));
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT now() AS time");
    res.json({ status: "ok", dbTime: result.rows[0].time });
  } catch (err) {
    console.error("Database error:", err.message);
    res.status(500).json({ status: "error", message: "Database connection failed" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});