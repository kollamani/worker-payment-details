const Member = require('../models/Member');
const Transaction = require('../models/Transaction');
const {
  getOriginalEnteredAmount,
  getEffectiveDepositBalance,
  getRemainingDepositBalance,
} = require('../utils/transactionCalculations');

const buildMemberQuery = (req, extraFilter = {}) => ({
  createdBy: req.admin._id,
  ...extraFilter,
});

const toDateKey = (value) => new Date(value).toISOString().slice(0, 10);

// Ensures every member payload carries both canonical (`workerName`/`admin`)
// and legacy (`name`/`createdByWorker`) keys so old documents and old
// clients keep working after the rename.
const withRenamedMemberKeys = (m = {}) => {
  const workerName = String(m.workerName ?? m.name ?? '').trim();
  const admin = String(m.admin ?? m.createdByWorker ?? '').trim();
  return { ...m, workerName, name: workerName, admin, createdByWorker: admin };
};

// @route GET /api/members
const getMembers = async (req, res, next) => {
  try {
    const members = await Member.find(buildMemberQuery(req)).sort({ createdAt: 1 }).lean();

    const withSNo = members.map((m, idx) => ({ ...withRenamedMemberKeys(m), sNo: idx + 1 }));

    res.status(200).json({ success: true, count: withSNo.length, members: withSNo });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/members/:id
const getMember = async (req, res, next) => {
  try {
    const member = await Member.findOne(buildMemberQuery(req, { _id: req.params.id }));
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    res.status(200).json({ success: true, member: withRenamedMemberKeys(member.toObject()) });
  } catch (err) {
    next(err);
  }
};

// Normalizes renamed payload keys:
//   workerName <- name (legacy), admin <- createdByWorker (legacy)
const pickMemberNames = (body = {}) => {
  const rawWorker =
    body.workerName !== undefined ? body.workerName : body.name !== undefined ? body.name : '';
  const rawAdmin =
    body.admin !== undefined
      ? body.admin
      : body.createdByWorker !== undefined
        ? body.createdByWorker
        : '';
  return {
    workerName: typeof rawWorker === 'string' ? rawWorker.trim() : rawWorker,
    admin: typeof rawAdmin === 'string' ? rawAdmin.trim() : rawAdmin,
  };
};

// @route POST /api/members
const createMember = async (req, res, next) => {
  try {
    const { jNo, phone, notes, villageName } = req.body;
    const { workerName, admin } = pickMemberNames(req.body);
    if (!jNo || !workerName || !admin) {
      return res.status(400).json({ success: false, message: 'J.No, Worker Name, and Admin are required' });
    }

    const member = await Member.create({
      jNo,
      workerName,
      name: workerName,
      villageName: villageName || '',
      admin,
      createdByWorker: admin,
      phone: phone || '',
      notes: notes || '',
      createdBy: req.admin._id,
    });
    res.status(201).json({ success: true, member });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'This J.No already exists for your account' });
    }
    next(err);
  }
};

// @route PUT /api/members/:id
const updateMember = async (req, res, next) => {
  try {
    const { jNo, phone, notes, isActive, villageName } = req.body;

    const member = await Member.findOne(buildMemberQuery(req, { _id: req.params.id }));
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    if (jNo !== undefined) member.jNo = jNo;
    // Accept both canonical (`workerName` / `admin`) and legacy (`name` / `createdByWorker`) keys.
    if (req.body.workerName !== undefined || req.body.name !== undefined) {
      const { workerName } = pickMemberNames(req.body);
      member.workerName = workerName;
      member.name = workerName;
    }
    if (villageName !== undefined) member.villageName = villageName;
    if (req.body.admin !== undefined || req.body.createdByWorker !== undefined) {
      const { admin } = pickMemberNames(req.body);
      member.admin = typeof admin === 'string' ? admin.trim() : admin;
      member.createdByWorker = typeof admin === 'string' ? admin.trim() : admin;
    }
    if (phone !== undefined) member.phone = phone;
    if (notes !== undefined) member.notes = notes;
    if (isActive !== undefined) member.isActive = isActive;

    await member.save();
    res.status(200).json({ success: true, member: withRenamedMemberKeys(member.toObject()) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'This J.No already exists for your account' });
    }
    next(err);
  }
};

// @route DELETE /api/members/:id
const deleteMember = async (req, res, next) => {
  try {
    const member = await Member.findOne(buildMemberQuery(req, { _id: req.params.id }));
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    await Transaction.deleteMany({ member: member._id, createdBy: req.admin._id });
    await member.deleteOne();

    res.status(200).json({ success: true, message: 'Member and related transactions deleted' });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/members/:id/summary
// Returns full financial summary + transaction history timeline for one member
const getMemberSummary = async (req, res, next) => {
  try {
    const member = await Member.findOne(buildMemberQuery(req, { _id: req.params.id }));
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const transactions = await Transaction.find({ member: member._id, createdBy: req.admin._id }).sort({ date: 1 });

    let totalDeposited = 0;
    let totalWithdrawn = 0;
    let totalExtraFees = 0;
    const depositPools = {};

    transactions.forEach((transaction) => {
      if (transaction.type !== 'deposit') return;
      const key = toDateKey(transaction.date);
      if (!depositPools[key]) depositPools[key] = [];
      depositPools[key].push({ remaining: getEffectiveDepositBalance(transaction) });
    });

    // Withdrawals replay FIFO across the cumulative balance of every deposit
    // pool recorded up to the withdrawal's date — mirroring the allocation
    // performed by createTransaction so displayed balances stay consistent.
    const depositPoolKeys = Object.keys(depositPools).sort();

    const timeline = transactions.map((t) => {
      const extra = Number(t.extraFee || 0);
      totalExtraFees += extra;
      const originalEnteredAmount = t.type === 'deposit' ? getOriginalEnteredAmount(t) : 0;
      const effectiveDepositBalance = t.type === 'deposit' ? getEffectiveDepositBalance(t) : 0;
      const remainingBalance = t.type === 'deposit' ? getRemainingDepositBalance(t) : 0;
      const calculatedAmount = t.type === 'deposit' ? effectiveDepositBalance : Number(t.amount || 0);
      const rowTotal = calculatedAmount + extra;
      if (t.type === 'deposit') totalDeposited += originalEnteredAmount;
      if (t.type === 'withdrawal') totalWithdrawn += t.amount;
      let remainingBalanceAfterDeduction = null;
      if (t.type === 'withdrawal') {
        const poolKey = t.deductFromDepositDate || t.sourceDepositDate;
        if (poolKey) {
          const dateKey = toDateKey(poolKey);
          let amountToDeduct = Number(t.amount || 0);
          depositPoolKeys.forEach((key) => {
            if (key > dateKey || amountToDeduct <= 0) return;
            depositPools[key].forEach((deposit) => {
              const deduction = Math.min(amountToDeduct, deposit.remaining);
              deposit.remaining -= deduction;
              amountToDeduct -= deduction;
            });
          });
          remainingBalanceAfterDeduction = depositPoolKeys
            .filter((key) => key <= dateKey)
            .reduce(
              (total, key) => total + depositPools[key].reduce((sum, deposit) => sum + deposit.remaining, 0),
              0
            );
        }
      }
      return {
        id: t._id,
        date: t.date,
        type: t.type,
        amount: t.amount,
        originalEnteredAmount,
        effectiveDepositBalance,
        remainingBalance,
        calculatedAmount,
        rowTotal,
        sourceDepositDate: t.sourceDepositDate,
        deductFromDepositDate: t.deductFromDepositDate || t.sourceDepositDate,
        remainingBalanceAfterDeduction,
        extraFee: extra,
        note: t.note,
        villageName: t.villageName,
      };
    });

    const halfAmount = transactions
      .filter((transaction) => transaction.type === 'deposit')
      .reduce((total, transaction) => total + getEffectiveDepositBalance(transaction), 0);
    const totalDepositBalance = halfAmount;
    const totalReceivedAmount = totalWithdrawn;
    const remainingHalfBalance = totalDepositBalance - totalReceivedAmount;
    const totalAvailablePool = totalDepositBalance + totalExtraFees;
    const remainingNetBalance = totalAvailablePool - totalReceivedAmount;
    const pendingBalance = remainingHalfBalance;

    res.status(200).json({
      success: true,
      member: withRenamedMemberKeys(typeof member.toObject === 'function' ? member.toObject() : member),
      summary: {
        totalDeposited,
        halfAmount,
        totalDepositAmount: totalDeposited,
        eligibleHalfAmountTotal: totalDepositBalance,
        totalDepositBalance,
        totalAvailablePool,
        totalWithdrawn,
        totalReceivedAmount,
        remainingHalfBalance,
        remainingNetBalance,
        pendingBalance,
        totalExtraFees,
      },
      timeline,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  getMemberSummary,
};
