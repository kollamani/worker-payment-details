const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true,
    },
    villageName: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      required: [true, 'Transaction date is required'],
      // Safety net: any write path that omits the date still stores a value.
      default: Date.now,
    },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal'],
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    originalAmount: {
      type: Number,
      min: [0.01, 'Original amount must be greater than 0'],
    },
    originalEnteredAmount: {
      type: Number,
      min: [0.01, 'Original entered amount must be greater than 0'],
    },
    effectiveDepositBalance: {
      type: Number,
      min: [0, 'Effective deposit balance cannot be negative'],
    },
    remainingBalance: {
      type: Number,
      min: [0, 'Remaining balance cannot be negative'],
    },
    sourceDepositDate: {
      type: Date,
    },
    deductFromDepositDate: {
      type: Date,
    },
    sourceDepositId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    extraFee: {
      type: Number,
      default: 0,
      min: [0, 'Extra fee cannot be negative'],
    },
    note: {
      type: String,
      trim: true,
      default: '',
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

TransactionSchema.index({ member: 1, date: 1 });
TransactionSchema.index({ createdBy: 1, villageName: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
