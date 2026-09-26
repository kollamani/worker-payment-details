const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      // select:false: hashes can never leak through a forgotten .select() /
      // .lean() query - login must opt in with .select('+password').
      select: false,
      validate: {
        validator: (value) => /\d/.test(value),
        message: 'Password must contain at least one digit',
      },
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

AdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  // cost 12: measurably slower to brute-force offline than the old 10.
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

AdminSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

AdminSchema.methods.toSafeObject = function () {
  return { id: this._id, username: this.username, name: this.name };
};

module.exports = mongoose.model('Admin', AdminSchema);
