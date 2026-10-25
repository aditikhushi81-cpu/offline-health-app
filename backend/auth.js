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
  const appUrl = () => process.env.APP_URL || "http://localhost:5173";

  // Creates a one-time verification token (only its hash is stored) and emails the link.
  async function sendVerificationEmail(user) {
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      "UPDATE email_verifications SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
      [user.id]
    );
    await pool.query(
      `INSERT INTO email_verifications (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '24 hours')`,
      [user.id, sha256(token)]
    );
    const link = `${appUrl()}/?verify=${token}`;
    await sendMail({
      to: user.email,
      subject: "Verify your email for Rural Health Records",
      text:
        `Hello ${user.name},\n\n` +
        `Please confirm your email address to activate your account. ` +
        `The link works once and expires in 24 hours:\n\n${link}\n\n` +
        `If you did not create this account, ignore this email.`,
    });
  }

  // POST /api/auth/register
  // Everyone registers as a nurse. Doctors are promoted by an admin in the database.
  router.post("/register", async (req, res) => {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email and password are required." });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const cleanEmail = email.trim().toLowerCase();

      const existing = await pool.query("SELECT id FROM users WHERE email = $1", [cleanEmail]);
      if (existing.rows.length > 0) {
        return res.status(409).json({
          message: "An account with this email already exists. If you have not verified it yet, use 'Resend verification email' on the sign-in page.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, email_verified)
         VALUES ($1, $2, $3, 'nurse', false)
         RETURNING id, name, email, role`,
        [name.trim(), cleanEmail, passwordHash]
      );

      await sendVerificationEmail(result.rows[0]);

      // No login token yet: the email must be verified first
      res.status(201).json({
        needsVerification: true,
        message: "Account created. Check your email and click the link to activate it.",
      });
    } catch (err) {
      console.error("Register error:", err.message);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  // POST /api/auth/verify-email
  router.post("/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "Verification token is required." });

      const found = await pool.query(
        `SELECT id, user_id FROM email_verifications
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
        [sha256(String(token))]
      );
      if (found.rows.length === 0) {
        return res.status(400).json({ message: "This verification link is invalid or has expired." });
      }

      await pool.query("UPDATE users SET email_verified = true WHERE id = $1", [found.rows[0].user_id]);
      await pool.query("UPDATE email_verifications SET used_at = now() WHERE id = $1", [found.rows[0].id]);

      res.json({ message: "Email verified. You can now sign in." });
    } catch (err) {
      console.error("Verify email error:", err.message);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  // POST /api/auth/resend-verification
  // Always answers the same, whether or not the email exists.
  router.post("/resend-verification", async (req, res) => {
    const reply = {
      message: "If that account exists and is not verified yet, a new link has been sent.",
    };
    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ message: "Please enter your email." });

      const result = await pool.query(
        "SELECT id, name, email, email_verified FROM users WHERE email = $1",
        [email]
      );
      const user = result.rows[0];
      if (user && !user.email_verified) {
        await sendVerificationEmail(user);
      }
      res.json(reply);
    } catch (err) {
      console.error("Resend verification error:", err.message);
      res.json(reply);
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
        "SELECT id, name, email, role, password_hash, email_verified FROM users WHERE email = $1",
        [email.trim().toLowerCase()]
      );
      const user = result.rows[0];

      // Same message for wrong email or wrong password, so nobody can probe which emails exist
      const valid = user && (await bcrypt.compare(password, user.password_hash));
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      // Checked only after the password is correct
      if (!user.email_verified) {
        return res.status(403).json({
          code: "EMAIL_NOT_VERIFIED",
          message: "Please verify your email first. Check your inbox for the link.",
        });
      }

      const { password_hash, email_verified, ...safeUser } = user;
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
        const token = crypto.randomBytes(32).toString("hex");
        await pool.query("UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
        await pool.query(
          `INSERT INTO password_resets (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + interval '15 minutes')`,
          [user.id, sha256(token)]
        );

        const link = `${appUrl()}/?reset=${token}`;
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
      // Receiving the reset email also proves the person owns the inbox
      await pool.query(
        "UPDATE users SET password_hash = $1, email_verified = true WHERE id = $2",
        [passwordHash, found.rows[0].user_id]
      );
      await pool.query("UPDATE password_resets SET used_at = now() WHERE id = $1", [found.rows[0].id]);

      res.json({ message: "Password updated. You can now log in." });
    } catch (err) {
      console.error("Reset password error:", err.message);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  return router;
};