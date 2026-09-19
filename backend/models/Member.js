const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema(
  {
    jNo: {
      type: String,
      required: [true, 'Journal/Token Number (J.No) is required'],
      trim: true,
    },
    // Canonical field: Worker's full name (formerly `name` / "Member Name").
    workerName: {
      type: String,
      trim: true,
    },
    // Deprecated alias of `workerName` — kept for backward compatibility
    // with documents created before the rename.
    name: {
      type: String,
      trim: true,
    },
    villageName: {
      type: String,
      trim: true,
      default: '',
    },
    // Canonical field: Admin who created / owns the worker (formerly
    // `createdByWorker` / "Worker Name").
    admin: {
      type: String,
      trim: true,
    },
    // Deprecated alias of `admin` — kept for backward compatibility.
    createdByWorker: {
      type: String,
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

// Keep canonical + legacy keys in sync so old documents and old clients
// keep working while new code uses `workerName` / `admin`.
MemberSchema.pre('validate', function syncRenamedFields(next) {
  const worker = String(this.workerName || '').trim() || String(this.name || '').trim();
  const adminName = String(this.admin || '').trim() || String(this.createdByWorker || '').trim();

  if (worker) {
    this.workerName = worker;
    this.name = worker;
  }
  if (adminName) {
    this.admin = adminName;
    this.createdByWorker = adminName;
  }

  if (!worker) {
    this.invalidate('workerName', 'Worker name is required');
  }
  if (!adminName) {
    this.invalidate('admin', 'Admin name is required');
  }
  next();
});

MemberSchema.index({ createdBy: 1, jNo: 1 }, { unique: true });

module.exports = mongoose.model('Member', MemberSchema);

