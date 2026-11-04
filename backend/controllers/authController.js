// backend/controllers/authController.js
const User = require('../models/User');
const Project = require('../models/Project');
const { hashPassword, verifyPassword, signToken } = require('../services/authService');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// very small brute-force guard: 10 failed logins per email+IP per 15 minutes
const fails = new Map();
function tooMany(key) {
  const now = Date.now();
  const arr = (fails.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  fails.set(key, arr);
  return arr.length >= 10;
}

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });

async function register(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim().slice(0, 80);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (await User.findOne({ email })) return res.status(409).json({ error: 'An account with this email already exists. Try signing in.' });

    const isFirst = (await User.countDocuments()) === 0;
    const user = await User.create({ name, email, passwordHash: hashPassword(password) });

    // Projects made before accounts existed belong to the first person who signs up.
    if (isFirst) {
      const r = await Project.updateMany({ userId: { $exists: false } }, { userId: user._id });
      const r2 = await Project.updateMany({ userId: null }, { userId: user._id });
      const n = (r.modifiedCount || 0) + (r2.modifiedCount || 0);
      if (n) console.log(`[auth] Assigned ${n} existing project(s) to ${email}`);
    }
    res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Could not create the account. Please try again.' });
  }
}

async function login(req, res) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const key = `${email}|${req.ip}`;
    if (tooMany(key)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    const user = await User.findOne({ email });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      fails.get(key).push(Date.now());
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Could not sign in. Please try again.' });
  }
}

async function me(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ error: 'Please sign in.' });
  res.json({ user: publicUser(user) });
}

module.exports = { register, login, me };
