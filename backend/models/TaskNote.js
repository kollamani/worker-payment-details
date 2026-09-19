const mongoose = require('mongoose');

const TaskNoteSchema = new mongoose.Schema(
  {
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
    targetAmount: {
      type: Number,
      default: null,
      min: [0, 'Target amount cannot be negative'],
    },
    totalAmount: {
      type: Number,
      default: null,
      min: [0, 'Total amount cannot be negative'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    remainingBalance: {
      type: Number,
      default: 0,
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

module.exports = mongoose.model('TaskNote', TaskNoteSchema);
