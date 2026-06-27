// backend/server.js
// ─────────────────────────────────────────────
//  DocNexus Backend Entry Point
// ─────────────────────────────────────────────

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const connectDB = require('./config/db');
const projectRoutes = require('./routes/projectRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the frontend statically so you can hit http://localhost:5000/ directly
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API routes
app.use('/api/projects', projectRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Centralized error handler (catches multer errors etc.)
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] DocNexus backend running at http://localhost:${PORT}`);
  });
});