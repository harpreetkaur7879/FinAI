require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { ROLES } = require('../constants/enums');

/**
 * Run once, manually, to bootstrap the very first admin account:
 *   node src/jobs/seedAdmin.js
 *
 * Why this exists: no route lets anyone self-register as admin (by design —
 * see authController.register, which hardcodes role: 'customer'). Every
 * other admin/officer account is created by an existing admin through
 * POST /api/users/officers. But the very first admin has to come from
 * somewhere — this script is that one deliberate bootstrap step.
 */
const seedAdmin = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_PHONE) {
    console.error(
      'Missing ADMIN_NAME / ADMIN_EMAIL / ADMIN_PHONE / ADMIN_PASSWORD in .env — set these before running this script.'
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`Admin with email ${ADMIN_EMAIL} already exists. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  const admin = await User.create({
    name: ADMIN_NAME || 'System Admin',
    email: ADMIN_EMAIL,
    phone: ADMIN_PHONE,
    password: ADMIN_PASSWORD,
    role: ROLES.ADMIN
  });

  console.log(`Admin account created: ${admin.email} (id: ${admin._id})`);
  await mongoose.disconnect();
};

seedAdmin().catch((err) => {
  console.error('Failed to seed admin:', err.message);
  process.exit(1);
});