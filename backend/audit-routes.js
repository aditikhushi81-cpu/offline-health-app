const express = require("express");
const requireAuth = require("./middleware");

module.exports = function (pool) {
  const router = express.Router();

  // GET /api/audit (doctors and admins only)
  router.get("/", requireAuth, async (req, res) => {
    if (req.user.role !== "doctor" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not allowed." });
    }
    try {
      const result = await pool.query(
        `SELECT a.id, a.user_name, a.action, a.entity, a.details, a.created_at,
                p.name AS patient_name
         FROM audit_log a
         LEFT JOIN patients p ON p.id = a.entity_id AND a.entity = 'patient'
         ORDER BY a.created_at DESC
         LIMIT 100`
      );
      res.json({ entries: result.rows });
    } catch (err) {
      console.error("Audit read error:", err.message);
      res.status(500).json({ message: "Could not load the audit log." });
    }
  });

  return router;
};