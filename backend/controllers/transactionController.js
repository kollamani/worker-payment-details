const Transaction = require('../models/Transaction');
const Member = require('../models/Member');

const toDateKey = (d) => {
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const buildMemberQuery = (req, extraFilter = {}) => ({ createdBy: req.admin._id, ...extraFilter });
const buildTransactionQuery = (req, extraFilter = {}) => ({ createdBy: req.admin._id, ...extraFilter });

// @route GET /api/transactions
// Optional query: ?member=<id>&type=deposit|withdrawal&from=&to=
const getTransactions = async (req, res, next) => {
  try {
    const { member, type, from, to } = req.query;
    const filter = buildTransactionQuery(req);
    if (member) filter.member = member;
    if (type) filter.type = type;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const transactions = await Transaction.find(filter)
      .populate('member', 'jNo name villageName')
      .sort({ date: -1, createdAt: -1 });

    res.status(200).json({ success: true, count: transactions.length, transactions });
  } catch (err) {
    next(err);
  }
};

// @route POST /api/transactions
const createTransaction = async (req, res, next) => {
  try {
    const { member, date, type, amount, note, villageName } = req.body;

    if (!member || !date || !type || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'member, date, type, and amount are required',
      });
    }

    if (!['deposit', 'withdrawal'].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be 'deposit' or 'withdrawal'" });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    const memberExists = await Member.findOne(buildMemberQuery(req, { _id: member }));
    if (!memberExists) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const effectiveVillage = (villageName || memberExists.villageName || '').trim();
    const transaction = await Transaction.create({
      member,
      villageName: effectiveVillage,
      date,
      type,
      amount,
      note: note || '',
      createdBy: req.admin._id,
    });
    const populated = await transaction.populate('member', 'jNo name villageName');

    res.status(201).json({ success: true, transaction: populated });
  } catch (err) {
    next(err);
  }
};

// @route PUT /api/transactions/:id
const updateTransaction = async (req, res, next) => {
  try {
    const { date, type, amount, note, villageName } = req.body;

    const transaction = await Transaction.findOne(buildTransactionQuery(req, { _id: req.params.id }));
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (type && !['deposit', 'withdrawal'].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be 'deposit' or 'withdrawal'" });
    }
    if (amount !== undefined && Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    if (date !== undefined) transaction.date = date;
    if (type !== undefined) transaction.type = type;
    if (amount !== undefined) transaction.amount = amount;
    if (note !== undefined) transaction.note = note;
    if (villageName !== undefined) transaction.villageName = villageName;

    await transaction.save();
    const populated = await transaction.populate('member', 'jNo name villageName');

    res.status(200).json({ success: true, transaction: populated });
  } catch (err) {
    next(err);
  }
};

// @route DELETE /api/transactions/:id
const deleteTransaction = async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne(buildTransactionQuery(req, { _id: req.params.id }));
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    await transaction.deleteOne();
    res.status(200).json({ success: true, message: 'Transaction deleted' });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/transactions/ledger/grid
// Builds the main Excel-style ledger grid: members x dates matrix + computed totals
const getLedgerGrid = async (req, res, next) => {
  try {
    const { village = '', worker = '' } = req.query;
    const memberFilter = buildMemberQuery(req);
    if (village) memberFilter.villageName = { $regex: new RegExp(`^${village.trim()}$`, 'i') };
    if (worker) memberFilter.createdByWorker = { $regex: new RegExp(`^${worker.trim()}$`, 'i') };

    const members = await Member.find(memberFilter).sort({ createdAt: 1 }).lean();
    const memberIds = members.map((m) => m._id);
    const transactionFilter = buildTransactionQuery(req, { member: { $in: memberIds } });
    if (village) transactionFilter.villageName = { $regex: new RegExp(`^${village.trim()}$`, 'i') };

    const transactions = await Transaction.find(transactionFilter).lean();

    const dateSet = new Set();
    transactions.forEach((t) => dateSet.add(toDateKey(t.date)));
    const dates = Array.from(dateSet).sort();

    const lookup = {};
    transactions.forEach((t) => {
      const mId = String(t.member);
      const dKey = toDateKey(t.date);
      if (!lookup[mId]) lookup[mId] = {};
      if (!lookup[mId][dKey]) lookup[mId][dKey] = { deposit: 0, withdrawal: 0 };
      lookup[mId][dKey][t.type] += t.amount;
    });

    const rows = members.map((m, idx) => {
      const mId = String(m._id);
      const cells = {};
      let totalDeposited = 0;
      let totalWithdrawn = 0;

      dates.forEach((dKey) => {
        const cell = (lookup[mId] && lookup[mId][dKey]) || { deposit: 0, withdrawal: 0 };
        cells[dKey] = cell;
        totalDeposited += cell.deposit;
        totalWithdrawn += cell.withdrawal;
      });

      const halfAmount = totalDeposited / 2;
      const pendingBalance = totalDeposited - totalWithdrawn;

      return {
        sNo: idx + 1,
        jNo: m.jNo,
        memberId: m._id,
        name: m.name,
        villageName: m.villageName || '',
        createdByWorker: m.createdByWorker || '',
        cells,
        totalDeposited,
        halfAmount,
        totalWithdrawn,
        pendingBalance,
      };
    });

    const grandTotals = rows.reduce(
      (acc, r) => {
        acc.totalDeposited += r.totalDeposited;
        acc.totalWithdrawn += r.totalWithdrawn;
        acc.pendingBalance += r.pendingBalance;
        return acc;
      },
      { totalDeposited: 0, totalWithdrawn: 0, pendingBalance: 0 }
    );
    grandTotals.halfAmount = grandTotals.totalDeposited / 2;

    const villages = await Member.distinct('villageName', buildMemberQuery(req, { villageName: { $ne: '' } }));
    const workers = await Member.distinct('createdByWorker', buildMemberQuery(req, { createdByWorker: { $ne: '' } }));

    res.status(200).json({
      success: true,
      dates,
      rows,
      grandTotals,
      villages: villages.filter(Boolean).sort(),
      workers: workers.filter(Boolean).sort(),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getLedgerGrid,
};
