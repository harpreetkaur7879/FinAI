const mongoose = require('mongoose');

/**
 * Why a separate config file instead of connecting inline in app.js?
 * - Keeps app.js focused on Express wiring only.
 * - Makes it trivial to swap connection logic (e.g. add retry/backoff)
 *   without touching the rest of the app.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    // Fail fast — a loan origination system must never run against a dead DB.
    process.exit(1);
  }
};

module.exports = connectDB;
