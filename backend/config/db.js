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

const RETRY_MS = 5000;

function explain(err) {
  if (/ENOTFOUND|ECONNREFUSED|ETIMEOUT|querySrv/i.test(err.message)) {
    return (
      'Cannot resolve the Atlas host. Check: (1) internet/VPN, (2) the cluster in ' +
      'MONGODB_URI still exists and is not paused/deleted in Atlas (copy a fresh ' +
      'connection string from Atlas > Connect), (3) your IP is allowed in Atlas > Network Access.'
    );
  }
  if (/auth/i.test(err.message)) return 'Bad username/password in MONGODB_URI.';
  return '';
}

// Keeps retrying instead of killing the process, so the backend (and nodemon)
// stay alive and recover by themselves when the network/Atlas comes back.
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[MongoDB] MONGODB_URI is not set in .env');
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => console.error('[MongoDB] Connection error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[MongoDB] Disconnected'));

  while (true) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
      console.log(`[MongoDB] Connected → ${mongoose.connection.name}`);
      return;
    } catch (err) {
      console.error('[MongoDB] Failed to connect:', err.message);
      const hint = explain(err);
      if (hint) console.error('[MongoDB] Hint:', hint);
      console.error(`[MongoDB] Retrying in ${RETRY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}

module.exports = connectDB;