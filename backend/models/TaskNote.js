const mongoose = require('mongoose');

// Allowed task-note categories. Exported so the controller can validate API
// payloads against the exact same list used by the schema.
const TASK_NOTE_CATEGORIES = ['PRESENT_HAVING', 'PRESENT_EXPENSE', 'EXPECTED_INCOME', 'EXPECTED_EXPENSE'];
const DEFAULT_TASK_NOTE_CATEGORY = 'PRESENT_HAVING';

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
