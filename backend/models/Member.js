const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema(
  {
    jNo: {
      type: String,
      required: [true, 'Journal/Token Number (J.No) is required'],
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Member name is required'],
      trim: true,
    },
    villageName: {
      type: String,
      trim: true,
      default: '',
    },
    createdByWorker: {
      type: String,
      required: [true, 'Worker name is required'],
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
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

MemberSchema.index({ createdBy: 1, jNo: 1 }, { unique: true });

module.exports = mongoose.model('Member', MemberSchema);
