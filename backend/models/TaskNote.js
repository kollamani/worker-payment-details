const mongoose = require('mongoose');

// Allowed task-note categories. Exported so the controller can validate API
// payloads against the exact same list used by the schema.
const TASK_NOTE_CATEGORIES = ['PRESENT_HAVING', 'PRESENT_EXPENSE', 'EXPECTED_INCOME', 'EXPECTED_EXPENSE'];
const DEFAULT_TASK_NOTE_CATEGORY = 'PRESENT_HAVING';

// Priority ladder used by the composer's priority pills. Uppercase keys are the
// values persisted by the API; MEDIUM is the default for every legacy document
// and for any client that does not send the field.
const TASK_NOTE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const DEFAULT_TASK_NOTE_PRIORITY = 'MEDIUM';

const TaskNoteSchema = new mongoose.Schema(
  {
    // Category slice the task belongs to. Strictly standardized uppercase keys
    // shared with the frontend dropdown. `required` + `default` together keep
    // legacy documents valid: hydration fills the default before validation.
    category: {
      type: String,
      enum: {
        values: TASK_NOTE_CATEGORIES,
        message: `Category must be one of: ${TASK_NOTE_CATEGORIES.join(', ')}`,
      },
      required: true,
      default: DEFAULT_TASK_NOTE_CATEGORY,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      required: [true, 'Task description is required'],
    },
    note: {
      type: String,
      trim: true,
      default: null,
      maxlength: [2000, 'Task note cannot exceed 2000 characters'],
    },
    presentAmount: {
      type: Number,
      required: [true, 'Present amount is required'],
      min: [0, 'Present amount cannot be negative'],
    },
    // Optional composer extras. All three are nullable/defaulted, so every
    // document created before they existed stays valid and untouched.
    priority: {
      type: String,
      enum: {
        values: TASK_NOTE_PRIORITIES,
        message: `Priority must be one of: ${TASK_NOTE_PRIORITIES.join(', ')}`,
      },
      default: DEFAULT_TASK_NOTE_PRIORITY,
      index: true,
    },
    // Team member (worker) the task is handed to, if any.
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      default: null,
      index: true,
    },
    // When the assignee should be reminded about this task, if at all.
    reminderAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['open', 'completed'],
      default: 'open',
    },
    completedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

TaskNoteSchema.index({ createdBy: 1, createdAt: -1 });

const TaskNote = mongoose.model('TaskNote', TaskNoteSchema);

module.exports = TaskNote;
module.exports.TASK_NOTE_CATEGORIES = TASK_NOTE_CATEGORIES;
module.exports.DEFAULT_TASK_NOTE_CATEGORY = DEFAULT_TASK_NOTE_CATEGORY;
module.exports.TASK_NOTE_PRIORITIES = TASK_NOTE_PRIORITIES;
module.exports.DEFAULT_TASK_NOTE_PRIORITY = DEFAULT_TASK_NOTE_PRIORITY;
