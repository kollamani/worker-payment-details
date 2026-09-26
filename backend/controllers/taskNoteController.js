const mongoose = require('mongoose');
const TaskNote = require('../models/TaskNote');
const Member = require('../models/Member');
const {
  TASK_NOTE_CATEGORIES,
  DEFAULT_TASK_NOTE_CATEGORY,
  TASK_NOTE_PRIORITIES,
  DEFAULT_TASK_NOTE_PRIORITY,
} = require('../models/TaskNote');

const CATEGORY_RULE = `Category must be one of: ${TASK_NOTE_CATEGORIES.join(', ')}`;
const PRIORITY_RULE = `Priority must be one of: ${TASK_NOTE_PRIORITIES.join(', ')}`;

/**
 * Resolves the optional `assignedTo` payload value into a member id that is
 * owned by the calling admin (or null). Returns `{ value }` on success and
 * `{ error }` for a malformed / foreign id, so a task can never end up
 * pointing at another account's worker.
 */
const resolveAssignedTo = async (rawValue, adminId) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return { value: null };
  if (!mongoose.Types.ObjectId.isValid(String(rawValue))) {
    return { error: 'Assigned member must be a valid member id' };
  }
  const exists = await Member.exists({ _id: rawValue, createdBy: adminId });
  if (!exists) return { error: 'Assigned member not found' };
  return { value: rawValue };
};

/**
 * Resolves the optional `reminderAt` payload value into a Date (or null).
 * Accepts ISO strings / epoch numbers, rejects anything unparseable.
 */
const resolveReminderAt = (rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return { value: null };
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return { error: 'Reminder must be a valid date and time' };
  }
  return { value: parsed };
};

// Only PRESENT_HAVING represents money currently held. PRESENT_EXPENSE is the
// expense bucket (its completed tasks reduce the balance), never an income
// source — it deliberately replaces the removed 'SAVINGS' option.
const INCOME_CATEGORIES = ['PRESENT_HAVING'];

/**
 * Null-safe amount reader. Legacy / hand-inserted documents may be missing
 * `presentAmount`, so a missing or non-numeric value must count as 0 rather
 * than poisoning every derived total with NaN.
 */
const toAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

/**
 * Dashboard summary metrics — single source of truth for the metric cards and
 * the toggleable financial-breakdown panel on the frontend.
 *
 * Buckets (always derived from the tasks, never stored):
 *   - Present Having   = PRESENT_HAVING tasks (money currently held)
 *   - Present Expense  = every COMPLETED task (the expense bucket)
 *   - Expected Income  = pending (open) EXPECTED_INCOME tasks
 *   - Expected Expense = pending (open) EXPECTED_EXPENSE tasks
 *
 * Metric cards:
 *   1. totalPresentHaving   = Present Having - Present Expense
 *   2. totalExpense         = Present Expense
 *   3. totalExpectedIncome  = Expected Income
 *   4. totalExpectedExpense = Expected Expense
 *
 * Calculated breakdown metrics (hidden by default, one click to reveal):
 *   5. havingSavings         = Present Having - Expected Expense - Present Expense
 *   6. overallIncome         = Present Having + Expected Income
 *   7. entireExpense         = Expected Expense + Present Expense
 *   8. totalExpectedSavings  = Overall Income - Entire Expense
 *
 * Mirrored 1:1 by frontend/src/utils/financialMetrics.js so both sides always
 * agree.
 */
const buildTaskSummary = (notes) => {
  const list = Array.isArray(notes) ? notes : [];
  const amountOf = (note) => toAmount(note.presentAmount);
  const categoryOf = (note) => note.category || DEFAULT_TASK_NOTE_CATEGORY;
  const isCompleted = (note) => note.status === 'completed';

  const presentIncome = list
    .filter((note) => INCOME_CATEGORIES.includes(categoryOf(note)))
    .reduce((sum, note) => sum + amountOf(note), 0);

  const totalExpense = list.filter(isCompleted).reduce((sum, note) => sum + amountOf(note), 0);

  const pendingOf = (category) =>
    list
      .filter((note) => !isCompleted(note) && categoryOf(note) === category)
      .reduce((sum, note) => sum + amountOf(note), 0);

  const totalExpectedIncome = pendingOf('EXPECTED_INCOME');
  const totalExpectedExpense = pendingOf('EXPECTED_EXPENSE');

  // Calculated breakdown metrics.
  const havingSavings = presentIncome - totalExpectedExpense - totalExpense;
  const overallIncome = presentIncome + totalExpectedIncome;
  const entireExpense = totalExpectedExpense + totalExpense;
  const totalExpectedSavings = overallIncome - entireExpense;

  return {
    totalPresentHaving: presentIncome - totalExpense,
    presentIncome,
    totalExpense,
    totalExpectedIncome,
    totalExpectedExpense,
    // Bucket aliases consumed by the breakdown metrics.
    presentExpense: totalExpense,
    expectedExpense: totalExpectedExpense,
    // 1. Having Savings   = Present Having - Expected Expense - Present Expense
    // 2. Overall Income   = Present Having + Expected Income
    // 3. Entire Expense   = Expected Expense + Present Expense
    // 4. Total Expected Savings = Overall Income - Entire Expense
    havingSavings,
    overallIncome,
    entireExpense,
    totalExpectedSavings,
    counts: {
      total: list.length,
      completed: list.filter(isCompleted).length,
      open: list.filter((note) => !isCompleted(note)).length,
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
    const {
      description,
      presentAmount,
      note: requestedNote,
      category: requestedCategory,
      priority: requestedPriority,
      assignedTo: requestedAssignedTo,
      reminderAt: requestedReminderAt,
    } = req.body;
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

    // Priority is optional on the wire too: a missing, null or empty value falls
    // back to MEDIUM, while an explicit unknown value is rejected.
    const priority =
      requestedPriority === undefined || requestedPriority === null || requestedPriority === ''
        ? DEFAULT_TASK_NOTE_PRIORITY
        : requestedPriority;
    if (!TASK_NOTE_PRIORITIES.includes(priority)) {
      return res.status(400).json({ success: false, message: PRIORITY_RULE });
    }

    const assignment = await resolveAssignedTo(requestedAssignedTo, req.admin._id);
    if (assignment.error) {
      return res.status(400).json({ success: false, message: assignment.error });
    }

    const reminder = resolveReminderAt(requestedReminderAt);
    if (reminder.error) {
      return res.status(400).json({ success: false, message: reminder.error });
    }

    const taskNote = await TaskNote.create({
      category,
      description: description.trim(),
      note: note || null,
      presentAmount: present,
      priority,
      assignedTo: assignment.value,
      reminderAt: reminder.value,
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

    if (req.body.priority !== undefined) {
      if (!TASK_NOTE_PRIORITIES.includes(req.body.priority)) {
        return res.status(400).json({ success: false, message: PRIORITY_RULE });
      }
      taskNote.priority = req.body.priority;
    }

    if (req.body.assignedTo !== undefined) {
      const assignment = await resolveAssignedTo(req.body.assignedTo, req.admin._id);
      if (assignment.error) {
        return res.status(400).json({ success: false, message: assignment.error });
      }
      taskNote.assignedTo = assignment.value;
    }

    if (req.body.reminderAt !== undefined) {
      const reminder = resolveReminderAt(req.body.reminderAt);
      if (reminder.error) {
        return res.status(400).json({ success: false, message: reminder.error });
      }
      taskNote.reminderAt = reminder.value;
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
