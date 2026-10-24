const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

module.exports = function (pool) {
  const router = express.Router();

  const makeToken = (user) =>
    jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

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

  return router;
};