// backend/config/db.js
// ─────────────────────────────────────────────
//  MongoDB Atlas Connection
// ─────────────────────────────────────────────

const dns = require('dns');
const mongoose = require('mongoose');

// On some Windows setups, Node's internal DNS resolver fails to reach the
// SRV records for mongodb+srv:// URIs (querySrv ECONNREFUSED) even though
// the OS resolver works fine (e.g. via `nslookup`). Forcing Node to use a
// known-good public DNS server fixes this without touching OS network
// settings.
dns.setServers(['8.8.8.8', '1.1.1.1']);

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