// Writes one audit entry. Never lets a logging problem break the main request.
async function logAudit(pool, user, action, entity, entityId, details) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.name, action, entity, entityId, details || null]
    );
  } catch (err) {
    console.error("Audit log error:", err.message);
  }
}

module.exports = logAudit;