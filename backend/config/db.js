// backend/config/db.js
// ─────────────────────────────────────────────
//  MongoDB Atlas Connection
// ─────────────────────────────────────────────

const mongoose = require('mongoose');

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not set in .env');
    }

    await mongoose.connect(uri);
    console.log(`[MongoDB] Connected → ${mongoose.connection.name}`);

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected');
    });
  } catch (err) {
    console.error('[MongoDB] Failed to connect:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;