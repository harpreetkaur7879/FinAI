const User = require('../models/User');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/apiResponse');
const { ROLES } = require('../constants/enums');

/**
 * Generates a sequential employee ID like "OFF-0001".
 * Why not let admin type it manually? Free-text IDs drift (typos,
 * inconsistent formats) — a system-generated sequential ID guarantees
 * uniqueness and consistency, and is a small but real thing an NBFC's
 * HR/IT system would actually do.
 */
const generateEmployeeId = async () => {
  const count = await User.countDocuments({ role: ROLES.LOAN_OFFICER });
  const next = String(count + 1).padStart(4, '0');
  return `OFF-${next}`;
};

/**
 * @route   POST /api/users/officers
 * @access  Private (admin only)
 * Officers are never self-registered — see authController.register,
 * which hardcodes role: 'customer'. Only an admin can create an
 * officer or admin account, and only through this route.
 */
const createOfficer = asyncHandler(async (req, res) => {
  const { name, email, phone, password, branch, designation, maxActiveApplications, reportingManager } =
    req.body;

  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    throw new ApiError(409, 'An account with this email or phone already exists');
  }

  if (reportingManager) {
    const manager = await User.findOne({ _id: reportingManager, role: ROLES.LOAN_OFFICER });
    if (!manager) {
      throw new ApiError(400, 'reportingManager must reference an existing loan officer');
    }
  }

  const employeeId = await generateEmployeeId();

  const officer = await User.create({
    name,
    email,
    phone,
    password,
    role: ROLES.LOAN_OFFICER,
    officerProfile: {
      employeeId,
      branch,
      designation,
      maxActiveApplications: maxActiveApplications || 20,
      reportingManager: reportingManager || undefined
    }
  });

  sendSuccess(res, 201, { user: officer.toSafeObject() }, 'Loan officer account created');
});

/**
 * @route   PUT /api/users/profile
 * @access  Private (customer only)
 * A customer must complete this before applying for a loan — enforced
 * later in the Loan module by checking customerProfile.profileCompleted.
 */
const completeProfile = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.CUSTOMER) {
    throw new ApiError(403, 'Only customers have a profile to complete');
  }

  const { dob, employmentType, monthlySalary, employerName } = req.body;

  req.user.customerProfile = {
    dob,
    employmentType,
    monthlySalary,
    employerName,
    profileCompleted: true
  };

  await req.user.save();

  sendSuccess(res, 200, { user: req.user.toSafeObject() }, 'Profile completed successfully');
});

/**
 * @route   GET /api/users
 * @access  Private (admin only)
 * Supports ?role=customer|loanOfficer|admin filter + basic pagination,
 * since an NBFC's user list could grow into the thousands.
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const { role, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (role) {
    if (!Object.values(ROLES).includes(role)) {
      throw new ApiError(400, `role must be one of: ${Object.values(ROLES).join(', ')}`);
    }
    filter.role = role;
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100); // cap at 100 per page

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    User.countDocuments(filter)
  ]);

  sendSuccess(
    res,
    200,
    {
      users: users.map((u) => u.toSafeObject()),
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    },
    'Users fetched'
  );
});

/**
 * @route   GET /api/users/:id
 * @access  Private (admin, or the user themselves)
 */
const getUserById = asyncHandler(async (req, res) => {
  const isSelf = req.user._id.toString() === req.params.id;
  const isAdmin = req.user.role === ROLES.ADMIN;

  if (!isSelf && !isAdmin) {
    throw new ApiError(403, 'Not authorized to view this user');
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  sendSuccess(res, 200, { user: user.toSafeObject() }, 'User fetched');
});

/**
 * @route   PATCH /api/users/:id/status
 * @access  Private (admin only)
 * Toggles isActive rather than deleting — NBFCs must retain user
 * records for regulatory/audit reasons (see Module 1 design notes).
 * Admin cannot deactivate themselves — avoids accidental lockout.
 */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { isActive } = req.body;

  if (typeof isActive !== 'boolean') {
    throw new ApiError(400, 'isActive must be a boolean');
  }

  if (req.params.id === req.user._id.toString()) {
    throw new ApiError(400, 'Admin cannot change their own active status');
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  user.isActive = isActive;
  await user.save();

  sendSuccess(
    res,
    200,
    { user: user.toSafeObject() },
    `User ${isActive ? 'activated' : 'deactivated'} successfully`
  );
});

module.exports = {
  createOfficer,
  completeProfile,
  getAllUsers,
  getUserById,
  updateUserStatus
};