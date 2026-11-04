// backend/server.js
// ─────────────────────────────────────────────
//  DocNexus Backend Entry Point
// ─────────────────────────────────────────────

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const projectRoutes = require('./routes/projectRoutes');
const authRoutes = require('./routes/authRoutes');

// Never let a stray error inside a background job kill the whole server:
// log it and keep serving (the page would otherwise poll a dead server forever).
process.on('unhandledRejection', (reason) => console.error('[Unhandled Rejection]', reason && reason.stack ? reason.stack : reason));
process.on('uncaughtException', (err) => console.error('[Uncaught Exception]', err && err.stack ? err.stack : err));

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the built React app (frontend/dist, created by `npm run build`) so you can hit
// http://localhost:5000/ directly. During development use the Vite dev server instead.
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) app.use(express.static(FRONTEND_DIST));

// Fail fast with a clear message while the database is unreachable
const mongoose = require('mongoose');
app.use(['/api/projects', '/api/auth'], (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database not connected yet. Check the backend terminal for the MongoDB error.' });
  }
  next();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Single-page app: any non-API page request gets index.html so React Router can handle it
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  const index = path.join(FRONTEND_DIST, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  next();
});

// Centralized error handler (catches multer errors etc.)
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[Server] DocNexus backend running at http://localhost:${PORT}`);
});
connectDB().then(async () => {
  // A restart kills any pipeline that was running; mark those projects failed so the
  // page shows "something went wrong" instead of spinning forever.
  try {
    const Project = require('./models/Project');
    const r = await Project.updateMany({ status: { $in: ['uploading', 'processing'] } }, { status: 'failed' });
    if (r.modifiedCount) console.log(`[Startup] Marked ${r.modifiedCount} interrupted project(s) as failed`);
  } catch (e) { console.error('[Startup] cleanup failed:', e.message); }
});