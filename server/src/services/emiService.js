const LoanEmi = require('../models/LoanEmi');

/**
 * Generates the full EMI schedule at disbursement time — one installment
 * per month of the tenure, due dates spaced monthly from the disbursement
 * date. Simplification worth noting: every installment uses the same
 * flat emiAmount (no adjustment for the final installment's rounding
 * remainder) — acceptable for a portfolio project, but a production
 * system would true up the last installment so the sum exactly equals
 * principal + interest.
 */
const generateEmiSchedule = async (application, session) => {
  const installments = [];
  const disbursementDate = application.disbursedAt || new Date();

  for (let i = 1; i <= application.tenure; i++) {
    const dueDate = new Date(disbursementDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    installments.push({
      loanApplication: application._id,
      customer: application.customer,
      installmentNumber: i,
      dueDate,
      amount: application.emiAmount,
      status: 'pending'
    });
  }

  return LoanEmi.create(installments, session ? { session, ordered: true } : { ordered: true });
};

module.exports = { generateEmiSchedule };