const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, EMPLOYMENT_TYPE } = require('../constants/enums');

const customerProfileSchema = new mongoose.Schema(
  {
    profileCompleted: { type: Boolean, default: false },
    dob: Date,
    employmentType: { type: String, enum: Object.values(EMPLOYMENT_TYPE) },
    monthlySalary: Number,
    employerName: String
  },
  { _id: false }
);

const officerProfileSchema = new mongoose.Schema(
  {
    employeeId: { type: String, unique: true, sparse: true },
    branch: String,
    designation: { type: String, enum: ['junior_officer', 'senior_officer'] },
    maxActiveApplications: { type: Number, default: 20 },
    reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: { type: String, required: true, select: false },
    phone: { type: String, required: true, unique: true, trim: true },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.CUSTOMER
    },
    isActive: { type: Boolean, default: true },

    // Never sent to the client — used only server-side to validate refresh flow
    refreshToken: { type: String, select: false },

    customerProfile: customerProfileSchema,
    officerProfile: officerProfileSchema
  },
  { timestamps: true }
);

// Hash password before save — only runs when password is actually modified,
// so profile updates don't accidentally re-hash an already-hashed password.
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Strip sensitive fields whenever a user doc is sent as JSON (e.g. in API responses)
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
