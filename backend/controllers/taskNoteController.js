const TaskNote = require('../models/TaskNote');
const { TASK_NOTE_CATEGORIES, DEFAULT_TASK_NOTE_CATEGORY } = require('../models/TaskNote');

const CATEGORY_RULE = `Category must be one of: ${TASK_NOTE_CATEGORIES.join(', ')}`;

// Only PRESENT_HAVING represents money currently held. PRESENT_EXPENSE is the
// expense bucket (its completed tasks reduce the balance), never an income
// source — it deliberately replaces the removed 'SAVINGS' option.
const INCOME_CATEGORIES = ['PRESENT_HAVING'];

/**
 * Dashboard summary metrics — single source of truth for the 4 metric cards.
 *   1. totalPresentHaving   = Present Income (PRESENT_HAVING)
 *                             - Present Expense (every COMPLETED task)
 *   2. totalExpense         = every COMPLETED task (Present Expense == completed)
 *   3. totalExpectedIncome  = pending (open) EXPECTED_INCOME tasks
 *   4. totalExpectedExpense = pending (open) EXPECTED_EXPENSE tasks
 */
const buildTaskSummary = (notes) => {
  const amountOf = (note) => Number(note.presentAmount || 0);
  const categoryOf = (note) => note.category || DEFAULT_TASK_NOTE_CATEGORY;
  const isCompleted = (note) => note.status === 'completed';

  const presentIncome = notes
    .filter((note) => INCOME_CATEGORIES.includes(categoryOf(note)))
    .reduce((sum, note) => sum + amountOf(note), 0);

  const totalExpense = notes.filter(isCompleted).reduce((sum, note) => sum + amountOf(note), 0);

  const pendingOf = (category) =>
    notes
      .filter((note) => !isCompleted(note) && categoryOf(note) === category)
      .reduce((sum, note) => sum + amountOf(note), 0);

  return {
    totalPresentHaving: presentIncome - totalExpense,
    presentIncome,
    totalExpense,
    totalExpectedIncome: pendingOf('EXPECTED_INCOME'),
    totalExpectedExpense: pendingOf('EXPECTED_EXPENSE'),
    counts: {
      total: notes.length,
      completed: notes.filter(isCompleted).length,
      open: notes.filter((note) => !isCompleted(note)).length,
    },
  };
};

const buildTaskNoteQuery = (req, extraFilter = {}) => ({
  createdBy: req.admin._id,
  ...extraFilter,
});

const getTaskNotes = async (req, res, next) => {
  try {
    const { category } = req.query;
    // Optional server-side slice: ?category=EXPECTED_INCOME returns only that
    // category. The response always carries each task's mapped category field.
    if (category && !TASK_NOTE_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: CATEGORY_RULE });
    }
    // Always load the full set so the summary reflects every task, then slice
    // the response when a category filter is requested.
    const taskNotes = await TaskNote.find(buildTaskNoteQuery(req)).sort({ createdAt: -1 });
    const visibleNotes = category ? taskNotes.filter((taskNote) => taskNote.category === category) : taskNotes;
    res.status(200).json({
      success: true,
      count: visibleNotes.length,
      taskNotes: visibleNotes,
      summary: buildTaskSummary(taskNotes),
    });
  } catch (err) {
    next(err);
  }
};

const createTaskNote = async (req, res, next) => {
  try {
    const { description, presentAmount, note: requestedNote, category: requestedCategory } = req.body;
    const present = Number(presentAmount);

    if (!description?.trim()) {
      return res.status(400).json({ success: false, message: 'Task description is required' });
    }
    if (!Number.isFinite(present) || present < 0) {
      return res.status(400).json({ success: false, message: 'Present amount must be a valid non-negative number' });
    }
    if (requestedNote !== undefined && requestedNote !== null && typeof requestedNote !== 'string') {
      return res.status(400).json({ success: false, message: 'Task note must be text' });
    }
    const note = typeof requestedNote === 'string' ? requestedNote.trim() : null;
    if (note && note.length > 2000) {
      return res.status(400).json({ success: false, message: 'Task note cannot exceed 2000 characters' });
    }

    // Category is optional on the wire for backward compatibility: a missing,
    // null, or empty value falls back to the default so old clients keep
    // working, while an explicit unknown value is rejected.
    const category =
      requestedCategory === undefined || requestedCategory === null || requestedCategory === ''
        ? DEFAULT_TASK_NOTE_CATEGORY
        : requestedCategory;
    if (!TASK_NOTE_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: CATEGORY_RULE });
    }

    const taskNote = await TaskNote.create({
      category,
      description: description.trim(),
      note: note || null,
      presentAmount: present,
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

    if (req.body.category !== undefined) {
      if (!TASK_NOTE_CATEGORIES.includes(req.body.category)) {
        return res.status(400).json({ success: false, message: CATEGORY_RULE });
      }
      taskNote.category = req.body.category;
    }

    if (req.body.presentAmount !== undefined) {
      const present = Number(req.body.presentAmount);
      if (!Number.isFinite(present) || present < 0) {
        return res.status(400).json({ success: false, message: 'Present amount must be a valid non-negative number' });
      }
      taskNote.presentAmount = present;
    }

    if (req.body.status !== undefined) {
      if (!['open', 'completed'].includes(req.body.status)) {
        return res.status(400).json({ success: false, message: 'Status must be open or completed' });
      }
      taskNote.status = req.body.status;
      taskNote.completedAt = req.body.status === 'completed' ? new Date() : null;
    }

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
