const Member = require('../models/Member');
const Transaction = require('../models/Transaction');

const buildMemberQuery = (req, extraFilter = {}) => ({
  createdBy: req.admin._id,
  ...extraFilter,
});

// @route GET /api/members
const getMembers = async (req, res, next) => {
  try {
    const members = await Member.find(buildMemberQuery(req)).sort({ createdAt: 1 }).lean();

    const withSNo = members.map((m, idx) => ({ ...m, sNo: idx + 1 }));

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
    res.status(200).json({ success: true, member });
  } catch (err) {
    next(err);
  }
};

// @route POST /api/members
const createMember = async (req, res, next) => {
  try {
    const { jNo, name, phone, notes, villageName, createdByWorker } = req.body;
    if (!jNo || !name || !createdByWorker) {
      return res.status(400).json({ success: false, message: 'J.No, Name, and Worker Name are required' });
    }

    const member = await Member.create({
      jNo,
      name,
      villageName: villageName || '',
      createdByWorker: createdByWorker.trim(),
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
    const { jNo, name, phone, notes, isActive, villageName, createdByWorker } = req.body;

    const member = await Member.findOne(buildMemberQuery(req, { _id: req.params.id }));
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    if (jNo !== undefined) member.jNo = jNo;
    if (name !== undefined) member.name = name;
    if (villageName !== undefined) member.villageName = villageName;
    if (createdByWorker !== undefined) member.createdByWorker = createdByWorker.trim();
    if (phone !== undefined) member.phone = phone;
    if (notes !== undefined) member.notes = notes;
    if (isActive !== undefined) member.isActive = isActive;

    await member.save();
    res.status(200).json({ success: true, member });
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

    const timeline = transactions.map((t) => {
      if (t.type === 'deposit') totalDeposited += t.amount;
      if (t.type === 'withdrawal') totalWithdrawn += t.amount;
      return {
        id: t._id,
        date: t.date,
        type: t.type,
        amount: t.amount,
        note: t.note,
        villageName: t.villageName,
      };
    });

    const halfAmount = totalDeposited / 2;
    const pendingBalance = totalDeposited - totalWithdrawn;

    res.status(200).json({
      success: true,
      member,
      summary: {
        totalDeposited,
        halfAmount,
        totalWithdrawn,
        pendingBalance,
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
