const Transaction = require('../models/Transaction');
const Member = require('../models/Member');
const mongoose = require('mongoose');
const {
  getOriginalEnteredAmount,
  getEffectiveDepositBalance,
  getRemainingDepositBalance,
  serverTodayKey,
  toDateKey,
  toUtcMidnight,
  WITHDRAWAL_EPSILON,
  planWithdrawalAllocation,
} = require('../utils/transactionCalculations');

const INSUFFICIENT_DEPOSIT_MESSAGE = 'Amount exceeds available deposit balance for this date.';

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
      .populate('member', 'jNo name workerName villageName admin createdByWorker')
      .sort({ date: -1, createdAt: -1 });

    res.status(200).json({ success: true, count: transactions.length, transactions });
  } catch (err) {
    next(err);
  }
};

// @route POST /api/transactions
const createTransaction = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const {
      member,
      date,
      type,
      amount,
      note,
      villageName,
      extraFee,
      sourceDepositDate,
      sourceDepositId,
      deductFromDepositDate,
    } = req.body;

    if (!member || !type || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'member, type, and amount are required',
      });
    }

    // Normalize the transaction date to a canonical UTC-midnight Date for the
    // intended calendar day. A missing/blank date falls back to the server's
    // current date, so a request can never fail just because the client
    // omitted it. Malformed and future dates are rejected explicitly.
    const todayKeyValue = serverTodayKey();
    const requestedDate = date ? toUtcMidnight(date) : null;
    if (date && !requestedDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction date. Use the YYYY-MM-DD format.',
      });
    }
    if (requestedDate && requestedDate.getTime() > toUtcMidnight(todayKeyValue).getTime()) {
      return res.status(400).json({
        success: false,
        message: 'Transaction date cannot be in the future.',
      });
    }
    const transactionDate = requestedDate || toUtcMidnight(todayKeyValue);

    // The UI no longer collects a separate "deposit date to deduct from";
    // withdrawals fall back to the transaction's own date, so the deduction
    // pool is the deposits recorded on that day. Explicit values still win.
    const withdrawalDepositDate = deductFromDepositDate || sourceDepositDate || transactionDate;

    if (!['deposit', 'withdrawal'].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be 'deposit' or 'withdrawal'" });
    }

    const amountValue = Number.parseFloat(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    const feeValue = Number.parseFloat(extraFee) || 0;
    if (!Number.isFinite(feeValue) || feeValue < 0) {
      return res.status(400).json({ success: false, message: 'Extra fee must be zero or a positive number' });
    }

    let createdTransaction;
    await session.withTransaction(async () => {
      const memberExists = await Member.findOne(buildMemberQuery(req, { _id: member })).session(session);
      if (!memberExists) {
        const error = new Error('Member not found');
        error.statusCode = 404;
        throw error;
      }

      const effectiveVillage = (villageName || memberExists.villageName || '').trim();
      const transactionData = {
        member,
        villageName: effectiveVillage,
        date: transactionDate,
        type,
        amount: amountValue,
        extraFee: feeValue,
        note: note || '',
        createdBy: req.admin._id,
      };

      if (type === 'withdrawal') {
        if (!withdrawalDepositDate && !sourceDepositId) {
          const error = new Error('A deposit date is required for withdrawal transactions');
          error.statusCode = 400;
          throw error;
        }

        let selectedDeposit;
        if (sourceDepositId) {
          selectedDeposit = await Transaction.findOne(
            buildTransactionQuery(req, { _id: sourceDepositId, member, type: 'deposit' })
          ).session(session);
          if (!selectedDeposit) {
            const error = new Error('Selected deposit record was not found');
            error.statusCode = 400;
            throw error;
          }
          transactionData.sourceDepositId = selectedDeposit._id;
          transactionData.sourceDepositDate = selectedDeposit.date;
          transactionData.deductFromDepositDate = selectedDeposit.date;
        } else {
          // Canonicalize the deduction day to UTC midnight of the intended
          // calendar date (accepts 'YYYY-MM-DD' or a Date) so stored pool
          // dates always line up with stored deposit dates exactly.
          const requestedPoolDate = withdrawalDepositDate ? toUtcMidnight(withdrawalDepositDate) : null;
          if (withdrawalDepositDate && !requestedPoolDate) {
            const error = new Error('Invalid source deposit date');
            error.statusCode = 400;
            throw error;
          }
          const parsedDepositDate = requestedPoolDate || transactionDate;
          transactionData.sourceDepositDate = parsedDepositDate;
          transactionData.deductFromDepositDate = parsedDepositDate;
        }

        // Canonical replay of the member's ledger — deliberately read BEFORE the
        // cache backfill below so the snapshot can never be contaminated by the
        // legacy normalization it performs. Usable deposit balance is 50% of the
        // amount originally entered, and every recorded withdrawal is applied
        // FIFO (oldest deposit first) against the deposits dated on or before its
        // own deduction day. This keeps the spendable balance independent of the
        // stored `remainingBalance` cache, which is missing on deposits written
        // by older versions and previously made the pool look empty, rejecting
        // valid withdrawals with "Amount exceeds available deposit balance for
        // this date.".
        const ledger = await Transaction.find(buildTransactionQuery(req, { member }))
          .sort({ date: 1, createdAt: 1, _id: 1 })
          .session(session);

        const depositStates = ledger
          .filter((t) => t.type === 'deposit')
          .map((t) => ({
            _id: t._id,
            transaction: t,
            dateKey: toDateKey(t.date),
            effectiveDepositBalance: getEffectiveDepositBalance(t),
            remainingBalance: getEffectiveDepositBalance(t),
          }));

        ledger
          .filter((t) => t.type === 'withdrawal')
          .forEach((withdrawal) => {
            const poolKey = toDateKey(
              withdrawal.deductFromDepositDate || withdrawal.sourceDepositDate || withdrawal.date
            );
            // A withdrawal without any usable date cannot be attributed to a
            // dated pool, so it consumes nothing. This is unreachable in
            // practice: `date` is required by the schema and every write path
            // rejects malformed dates.
            if (!poolKey) return;
            let remainingToDeduct = Number(withdrawal.amount || 0);
            for (const state of depositStates) {
              if (remainingToDeduct <= WITHDRAWAL_EPSILON) break;
              if (state.dateKey > poolKey) break;
              const deduction = Math.min(remainingToDeduct, state.remainingBalance);
              if (deduction <= 0) continue;
              state.remainingBalance -= deduction;
              remainingToDeduct -= deduction;
            }
          });

        // Normalize legacy rows so the stored helper fields the UI reads exist.
        await Transaction.updateMany(
          buildTransactionQuery(req, { member, type: 'deposit' }),
          [
            { $set: { originalAmount: { $ifNull: ['$originalAmount', '$amount'] } } },
            { $set: { originalEnteredAmount: { $ifNull: ['$originalEnteredAmount', '$amount'] } } },
            {
              $set: {
                remainingBalance: {
                  $cond: [
                    { $eq: [{ $type: '$effectiveDepositBalance' }, 'missing'] },
                    { $min: [{ $ifNull: ['$remainingBalance', '$amount'] }, { $multiply: ['$amount', 0.5] }] },
                    { $ifNull: ['$remainingBalance', { $multiply: ['$amount', 0.5] }] },
                  ],
                },
              },
            },
            {
              $set: {
                effectiveDepositBalance: {
                  $ifNull: ['$effectiveDepositBalance', { $multiply: ['$amount', 0.5] }],
                },
              },
            },
          ],
          { session }
        );

        // The pool available to this withdrawal is the CUMULATIVE balance of
        // every deposit dated up to and including the selected deduction date
        // (or the single explicitly chosen deposit) — not just the deposits
        // booked on that exact day.
        //
        // Capacity is derived from the ledger itself — 50% of every deposit's
        // originally entered amount minus every recorded withdrawal — and never
        // from the stored `remainingBalance` cache, so a stale or missing cache
        // can no longer reject a withdrawal the member can actually afford.
        // Two bounds apply, and the stricter one wins:
        //   1. the balance that was available on the selected day, and
        //   2. the member's total unused balance, so a later-dated withdrawal
        //      can never be silently overdrawn by a back-dated one.
        const withdrawalDateKey = toDateKey(transactionData.sourceDepositDate);
        const dateScopedPool = depositStates
          .filter((state) => state.dateKey <= withdrawalDateKey)
          .reduce((total, state) => total + state.effectiveDepositBalance, 0);

        let withdrawnUpToDate = 0;
        let withdrawnInTotal = 0;
        ledger
          .filter((t) => t.type === 'withdrawal')
          .forEach((withdrawal) => {
            const withdrawalAmount = Number(withdrawal.amount || 0);
            withdrawnInTotal += withdrawalAmount;
            const poolKey = toDateKey(
              withdrawal.deductFromDepositDate || withdrawal.sourceDepositDate || withdrawal.date
            );
            // The withdrawal currently being recorded is not part of `ledger`
            // yet, so no self-exclusion bookkeeping is needed here.
            if (poolKey && poolKey <= withdrawalDateKey) withdrawnUpToDate += withdrawalAmount;
          });

        const totalUsableBalance = depositStates.reduce(
          (total, state) => total + state.effectiveDepositBalance,
          0
        );
        const globalRemaining = Math.max(0, totalUsableBalance - withdrawnInTotal);
        const dateScopedRemaining = Math.max(0, dateScopedPool - withdrawnUpToDate);

        const eligibleDeposits = sourceDepositId
          ? depositStates.filter((state) => String(state._id) === String(sourceDepositId))
          : depositStates.filter((state) => state.dateKey <= withdrawalDateKey);

        const availableBalance = sourceDepositId
          ? eligibleDeposits.reduce((total, state) => total + state.remainingBalance, 0)
          : Math.min(dateScopedRemaining, globalRemaining);

        // Validate before writing anything: an amount that fits inside the
        // available balance is always accepted — including one exactly equal to
        // it, since the epsilon forgives float residue from the 50% splits.
        // Only a genuine shortfall is rejected.
        if (Number(amount) - availableBalance > WITHDRAWAL_EPSILON) {
          const error = new Error(
            sourceDepositId
              ? `${INSUFFICIENT_DEPOSIT_MESSAGE} Selected deposit balance available: ₹${availableBalance.toFixed(2)}.`
              : dateScopedRemaining <= globalRemaining
                ? `${INSUFFICIENT_DEPOSIT_MESSAGE} Available balance up to ${withdrawalDateKey}: ₹${availableBalance.toFixed(2)}.`
                : `${INSUFFICIENT_DEPOSIT_MESSAGE} Total unused balance: ₹${availableBalance.toFixed(2)} (available up to ${withdrawalDateKey}: ₹${dateScopedRemaining.toFixed(2)}).`
          );
          error.statusCode = 400;
          throw error;
        }

        // Best-effort FIFO allocation used only to keep the stored
        // `remainingBalance` mirror in step with the replayed ledger. A
        // back-dated withdrawal can be affordable through bound 1 while the
        // deposits it targets were already drawn down, so a partial allocation
        // is acceptable — the amount itself is already validated above.
        const spendableDeposits = eligibleDeposits.filter((state) => state.remainingBalance > 0);
        const { plan } = planWithdrawalAllocation(spendableDeposits, amount);

        const deductionsById = new Map(plan.map(({ id, deduction }) => [String(id), deduction]));

        // Persist the replayed balances so the cached `effectiveDepositBalance`
        // and `remainingBalance` fields always mirror the canonical figures
        // (this also self-heals deposits created before those fields existed).
        for (const state of depositStates) {
          const deduction = deductionsById.get(String(state._id)) || 0;
          const nextBalance = state.remainingBalance - deduction;
          const updated = await Transaction.findOneAndUpdate(
            buildTransactionQuery(req, { _id: state._id, type: 'deposit' }),
            {
              $set: {
                effectiveDepositBalance: getEffectiveDepositBalance(state.transaction),
                remainingBalance: nextBalance <= WITHDRAWAL_EPSILON ? 0 : nextBalance,
              },
            },
            { new: true, session }
          );
          if (!updated) {
            const error = new Error('Deposit balances changed while recording this withdrawal. Please retry.');
            error.statusCode = 409;
            throw error;
          }
        }
      } else {
        transactionData.originalAmount = amountValue;
        transactionData.originalEnteredAmount = amountValue;
        transactionData.effectiveDepositBalance = amountValue * 0.5;
        transactionData.remainingBalance = amountValue * 0.5;
      }

      [createdTransaction] = await Transaction.create([transactionData], { session });
    });

    const populated = await createdTransaction.populate('member', 'jNo name workerName villageName admin createdByWorker');
    res.status(201).json({ success: true, transaction: populated });
  } catch (err) {
    next(err);
  } finally {
    await session.endSession();
  }
};

// @route GET /api/transactions/deposit-balances?memberId=<id>
const getDepositBalances = async (req, res, next) => {
  try {
    const memberId = req.params.memberId || req.query.memberId || req.query.member;
    if (!memberId) return res.status(400).json({ success: false, message: 'memberId is required' });

    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ success: false, message: 'Invalid memberId' });
    }

    const memberObjectId = new mongoose.Types.ObjectId(memberId);
    const memberExists = await Member.findOne(buildMemberQuery(req, { _id: memberObjectId }));
    if (!memberExists) return res.status(404).json({ success: false, message: 'Member not found' });

    const deposits = await Transaction.find(
      buildTransactionQuery(req, {
        member: memberObjectId,
        type: { $regex: /^deposit$/i },
      })
    ).sort({ date: -1, createdAt: -1 });
    const balances = deposits
      .map((deposit) => ({
        _id: deposit._id,
        id: deposit._id,
        date: deposit.date,
        amount: getOriginalEnteredAmount(deposit),
        originalEnteredAmount: getOriginalEnteredAmount(deposit),
        effectiveDepositBalance: getEffectiveDepositBalance(deposit),
        availableBalance: getRemainingDepositBalance(deposit),
        remainingBalance: getRemainingDepositBalance(deposit),
      }))
      .filter((deposit) => deposit.remainingBalance > 0);

    const allTransactions = deposits.length === 0
      ? await Transaction.find(buildTransactionQuery(req, { member: memberObjectId }))
          .select('_id date type amount remainingBalance effectiveDepositBalance')
          .sort({ date: -1, createdAt: -1 })
          .lean()
      : [];

    res.status(200).json({ success: true, balances, deposits: balances, allTransactions });
  } catch (err) {
    next(err);
  }
};

// @route PUT /api/transactions/:id
const updateTransaction = async (req, res, next) => {
  try {
    const { date, type, amount, note, villageName, extraFee } = req.body;

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
    if (extraFee !== undefined) {
      const feeValue = Number(extraFee || 0);
      if (!Number.isFinite(feeValue) || feeValue < 0) {
        return res.status(400).json({ success: false, message: 'Extra fee must be zero or a positive number' });
      }
      transaction.extraFee = feeValue;
    }

    if (date !== undefined && date !== null && String(date).trim() !== '') {
      // Same canonicalization + guards as the create flow so edits can never
      // persist a malformed or future-dated transaction.
      const normalizedDate = toUtcMidnight(date);
      if (!normalizedDate) {
        return res.status(400).json({
          success: false,
          message: 'Invalid transaction date. Use the YYYY-MM-DD format.',
        });
      }
      if (normalizedDate.getTime() > toUtcMidnight(serverTodayKey()).getTime()) {
        return res.status(400).json({
          success: false,
          message: 'Transaction date cannot be in the future.',
        });
      }
      transaction.date = normalizedDate;
    }
    if (type !== undefined) transaction.type = type;
    if (amount !== undefined) {
      const amountValue = Number.parseFloat(amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
      }
      transaction.amount = amountValue;
      if ((type || transaction.type) === 'deposit') {
        transaction.originalAmount = amountValue;
        transaction.originalEnteredAmount = amountValue;
        transaction.effectiveDepositBalance = amountValue * 0.5;
        transaction.remainingBalance = amountValue * 0.5;
      }
    }
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

// @route DELETE /api/transactions/user/:userId/all
const deleteAllUserTransactions = async (req, res, next) => {
  try {
    const member = await Member.findOne(buildMemberQuery(req, { _id: req.params.userId }));
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    const result = await Transaction.deleteMany({ member: member._id, createdBy: req.admin._id });
    res.status(200).json({
      success: true,
      message: 'All transactions deleted for this member',
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    next(err);
  }
};

// @route DELETE|POST /api/transactions/filtered-delete
// Danger Zone bulk delete. Deletes every transaction that matches the
// supplied filter criteria. Filters are accepted from the query string or a
// JSON body: startDate, endDate, memberId, workerId, worker (name), village,
// adminId. Dates accept 'YYYY-MM-DD' or full ISO strings and are canonicalised
// to UTC midnight so the range lines up exactly with how transaction dates
// are stored.
const deleteTransactionsByDateRange = async (req, res, next) => {
  try {
    const { startDate, endDate, workerId, memberId, worker, village, adminId } = {
      ...req.query,
      ...(req.body || {}),
    };

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    // An adminId, when supplied, must reference the authenticated admin.
    if (adminId) {
      if (!mongoose.Types.ObjectId.isValid(adminId) || String(adminId) !== String(req.admin._id)) {
        return res.status(403).json({ success: false, message: 'You can only delete your own transactions' });
      }
    }

    // Canonicalise the range to UTC midnight of the intended calendar days.
    // toUtcMidnight rejects impossible dates (e.g. '2026-02-31') that would
    // otherwise roll over silently and delete the wrong window.
    const start = toUtcMidnight(startDate);
    if (!start) {
      return res.status(400).json({ success: false, message: 'Invalid startDate. Use the YYYY-MM-DD format.' });
    }
    // The end boundary is exclusive midnight of the day AFTER endDate so the
    // whole end date (all day) is included in the deletion window.
    const endExclusive = toUtcMidnight(endDate);
    if (!endExclusive) {
      return res.status(400).json({ success: false, message: 'Invalid endDate. Use the YYYY-MM-DD format.' });
    }
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    if (start.getTime() >= endExclusive.getTime()) {
      return res.status(400).json({ success: false, message: 'Start date cannot be after end date' });
    }

    const filter = {
      date: { $gte: start, $lt: endExclusive },
    };

    // Optional member scoping. `memberId` wins, then `workerId` when it holds
    // a member ObjectId; otherwise `worker` is treated as a worker NAME and
    // resolved to that worker's members (case-insensitive exact match). An
    // unknown worker resolves to an empty id list, which deletes nothing —
    // never falling through to an unscoped delete.
    const requestedMemberId = memberId || (workerId && mongoose.Types.ObjectId.isValid(workerId) ? workerId : null);
    if (requestedMemberId) {
      filter.member = requestedMemberId;
    } else {
      const workerName = String(worker || workerId || '').trim();
      if (workerName) {
        const matchingMembers = await Member.find(
          buildMemberQuery(req, {
            createdByWorker: { $regex: new RegExp(`^${workerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          })
        ).select('_id').lean();
        filter.member = { $in: matchingMembers.map((member) => member._id) };
      }
    }

    // Optional village scoping (case-insensitive exact match), mirroring the
    // ledger grid's village filter so the deleted set matches what the user
    // sees on screen.
    const villageName = String(village || '').trim();
    if (villageName) {
      filter.villageName = { $regex: new RegExp(`^${villageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    }

    const result = await Transaction.deleteMany(buildTransactionQuery(req, filter));

    res.status(200).json({
      success: true,
      count: result.deletedCount,
      deletedCount: result.deletedCount,
      message: result.deletedCount > 0
        ? 'Filtered transactions deleted successfully!'
        : 'No transactions matched the selected filters.',
    });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/transactions/ledger/grid
// Builds the main Excel-style ledger grid: members x dates matrix + computed totals
const getLedgerGrid = async (req, res, next) => {
  try {
    const { village = '', worker = '', admin = '' } = req.query;
    const adminFilter = String(worker || admin || '').trim();
    const memberFilter = buildMemberQuery(req);
    if (village) memberFilter.villageName = { $regex: new RegExp(`^${village.trim()}$`, 'i') };
    if (adminFilter) {
      memberFilter.$or = [
        { admin: { $regex: new RegExp(`^${adminFilter}$`, 'i') } },
        { createdByWorker: { $regex: new RegExp(`^${adminFilter}$`, 'i') } },
      ];
    }

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
      lookup[mId][dKey][t.type] +=
        t.type === 'deposit' ? getOriginalEnteredAmount(t) : Number(t.amount || 0);
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

      const halfAmount = dates.reduce((total, dateKey) => {
        const cell = cells[dateKey];
        return total + Number(cell.deposit || 0) * 0.5;
      }, 0);
      const pendingBalance = halfAmount - totalWithdrawn;

      return {
        sNo: idx + 1,
        jNo: m.jNo,
        memberId: m._id,
        workerName: String(m.workerName ?? m.name ?? ''),
        name: String(m.workerName ?? m.name ?? ''),
        villageName: m.villageName || '',
        admin: String(m.admin ?? m.createdByWorker ?? ''),
        createdByWorker: String(m.admin ?? m.createdByWorker ?? ''),
        cells,
        totalDeposited,
        totalDepositAmount: totalDeposited,
        halfAmount,
        eligibleHalfAmountTotal: halfAmount,
        totalWithdrawn,
        totalReceivedAmount: totalWithdrawn,
        remainingHalfBalance: pendingBalance,
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
    grandTotals.totalDepositAmount = grandTotals.totalDeposited;
    grandTotals.eligibleHalfAmountTotal = grandTotals.halfAmount;
    grandTotals.totalReceivedAmount = grandTotals.totalWithdrawn;
    grandTotals.remainingHalfBalance = grandTotals.pendingBalance;

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
  getDepositBalances,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  deleteAllUserTransactions,
  deleteTransactionsByDateRange,
  getLedgerGrid,
};
