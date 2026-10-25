const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendMail = require("./mailer");

module.exports = function (pool) {
  const router = express.Router();

  const makeToken = (user) =>
    jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

  const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

  // POST /api/auth/register
  router.post("/register", async (req, res) => {
    try {
      const { name, email, password, role } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email and password are required." });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }
      // Only nurse and doctor can self-register. Admin is never allowed here.
      const safeRole = role === "doctor" ? "doctor" : "nurse";

      const cleanEmail = email.trim().toLowerCase();

      const existing = await pool.query("SELECT id FROM users WHERE email = $1", [cleanEmail]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, role`,
        [name.trim(), cleanEmail, passwordHash, safeRole]
      );

      const user = result.rows[0];
      res.status(201).json({ token: makeToken(user), user });
    } catch (err) {
      console.error("Register error:", err.message);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  // POST /api/auth/login
  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
      }

      const result = await pool.query(
        "SELECT id, name, email, role, password_hash FROM users WHERE email = $1",
        [email.trim().toLowerCase()]
      );
      const user = result.rows[0];

      // Same message for wrong email or wrong password, so nobody can probe which emails exist
      const valid = user && (await bcrypt.compare(password, user.password_hash));
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      const { password_hash, ...safeUser } = user;
      res.json({ token: makeToken(safeUser), user: safeUser });
    } catch (err) {
      console.error("Login error:", err.message);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  // POST /api/auth/forgot-password
  // Always answers the same, whether or not the email exists.
  router.post("/forgot-password", async (req, res) => {
    const reply = {
      message: "If an account with that email exists, a reset link has been sent.",
    };
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ message: "Please enter your email." });

      const result = await pool.query("SELECT id, name FROM users WHERE email = $1", [email]);
      const user = result.rows[0];

      if (user) {
        // Random token. Only its hash is stored.
        const token = crypto.randomBytes(32).toString("hex");
        await pool.query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
        await pool.query(
          `INSERT INTO password_resets (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + interval '15 minutes')`,
          [user.id, sha256(token)]
        );

        const link = `${process.env.APP_URL || "http://localhost:5173"}/?reset=${token}`;
        await sendMail({
          to: email,
          subject: "Reset your Rural Health Records password",
          text:
            `Hello ${user.name},\n\n` +
            `Use this link to set a new password. It works once and expires in 15 minutes:\n\n${link}\n\n` +
            `If you did not ask for this, ignore this email.`,
        });
      }
      res.json(reply);
    } catch (err) {
      console.error("Forgot password error:", err.message);
      // Same reply on purpose, so errors do not reveal anything
      res.json(reply);
    }
  });

  // POST /api/auth/reset-password
  router.post("/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and new password are required." });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const found = await pool.query(
        `SELECT id, user_id FROM password_resets
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
        [sha256(String(token))]
      );
      if (found.rows.length === 0) {
        return res.status(400).json({ message: "This reset link is invalid or has expired." });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, found.rows[0].user_id]);
      await pool.query("UPDATE password_resets SET used_at = now() WHERE id = $1", [found.rows[0].id]);

      res.json({ message: "Password updated. You can now log in." });
    } catch (err) {
      console.error("Reset password error:", err.message);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  return router;
};