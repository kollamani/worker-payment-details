const TaskNote = require('../models/TaskNote');

const buildTaskNoteQuery = (req, extraFilter = {}) => ({
  createdBy: req.admin._id,
  ...extraFilter,
});

const getTaskNotes = async (req, res, next) => {
  try {
    const taskNotes = await TaskNote.find(buildTaskNoteQuery(req)).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: taskNotes.length, taskNotes });
  } catch (err) {
    next(err);
  }
};

const createTaskNote = async (req, res, next) => {
  try {
    const { description, presentAmount, note: requestedNote } = req.body;
    const requestedTotal = req.body.totalAmount ?? req.body.targetAmount;
    const present = Number(presentAmount);
    const target = requestedTotal === '' || requestedTotal === null || requestedTotal === undefined
      ? null
      : Number(requestedTotal);

    if (!description?.trim()) {
      return res.status(400).json({ success: false, message: 'Task description is required' });
    }
    if (!Number.isFinite(present) || present < 0) {
      return res.status(400).json({ success: false, message: 'Present amount must be a valid non-negative number' });
    }
    if (target !== null && (!Number.isFinite(target) || target < 0)) {
      return res.status(400).json({ success: false, message: 'Target amount must be a valid non-negative number' });
    }
    if (requestedNote !== undefined && requestedNote !== null && typeof requestedNote !== 'string') {
      return res.status(400).json({ success: false, message: 'Task note must be text' });
    }
    const note = typeof requestedNote === 'string' ? requestedNote.trim() : null;
    if (note && note.length > 2000) {
      return res.status(400).json({ success: false, message: 'Task note cannot exceed 2000 characters' });
    }

    const taskNote = await TaskNote.create({
      description: description.trim(),
      note: note || null,
      presentAmount: present,
      targetAmount: target,
      totalAmount: target,
      remainingBalance: present - (target ?? 0),
      status: 'open',
      createdBy: req.admin._id,
    });

    res.status(201).json({ success: true, taskNote });
  } catch (err) {
    next(err);
  }
};

const updateTaskNote = async (req, res, next) => {
  try {
    const taskNote = await TaskNote.findOne(buildTaskNoteQuery(req, { _id: req.params.id }));
    if (!taskNote) {
      return res.status(404).json({ success: false, message: 'Task note not found' });
    }

    if (req.body.description !== undefined) {
      if (!String(req.body.description).trim()) {
        return res.status(400).json({ success: false, message: 'Task description is required' });
      }
      taskNote.description = String(req.body.description).trim();
    }

    if (req.body.note !== undefined) {
      if (req.body.note !== null && typeof req.body.note !== 'string') {
        return res.status(400).json({ success: false, message: 'Task note must be text' });
      }
      const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
      if (note.length > 2000) {
        return res.status(400).json({ success: false, message: 'Task note cannot exceed 2000 characters' });
      }
      taskNote.note = note || null;
    }

    if (req.body.presentAmount !== undefined) {
      const present = Number(req.body.presentAmount);
      if (!Number.isFinite(present) || present < 0) {
        return res.status(400).json({ success: false, message: 'Present amount must be a valid non-negative number' });
      }
      taskNote.presentAmount = present;
    }

    if (req.body.totalAmount !== undefined || req.body.targetAmount !== undefined) {
      const requestedTotal = req.body.totalAmount ?? req.body.targetAmount;
      const target = requestedTotal === '' || requestedTotal === null
        ? null
        : Number(requestedTotal);
      if (target !== null && (!Number.isFinite(target) || target < 0)) {
        return res.status(400).json({ success: false, message: 'Target amount must be a valid non-negative number' });
      }
      taskNote.targetAmount = target;
      taskNote.totalAmount = target;
    }

    if (req.body.status !== undefined) {
      if (!['open', 'completed'].includes(req.body.status)) {
        return res.status(400).json({ success: false, message: 'Status must be open or completed' });
      }
      taskNote.status = req.body.status;
      taskNote.completedAt = req.body.status === 'completed' ? new Date() : null;
    }

    taskNote.remainingBalance =
      Number(taskNote.presentAmount || 0) - Number(taskNote.targetAmount ?? taskNote.totalAmount ?? 0);

    await taskNote.save();
    res.status(200).json({ success: true, taskNote });
  } catch (err) {
    next(err);
  }
};

const deleteTaskNote = async (req, res, next) => {
  try {
    const taskNote = await TaskNote.findOne(buildTaskNoteQuery(req, { _id: req.params.id }));
    if (!taskNote) {
      return res.status(404).json({ success: false, message: 'Task note not found' });
    }

    await taskNote.deleteOne();
    res.status(200).json({ success: true, message: 'Task note deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getTaskNotes, createTaskNote, updateTaskNote, deleteTaskNote };
