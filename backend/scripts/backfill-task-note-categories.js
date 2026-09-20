/*
 * Backfills the `category` field for TaskNote documents created before the
 * category feature shipped (the deployed backend used to strip the field, so
 * production documents may be missing it entirely). Missing values are set to
 * the schema default 'PRESENT_HAVING'.
 *
 * SAFE BY DEFAULT: runs in DRY-RUN mode and only reports what it WOULD change.
 * Pass --apply to actually write.
 *
 * Usage:
 *   node scripts/backfill-task-note-categories.js            (dry run)
 *   node scripts/backfill-task-note-categories.js --apply    (writes)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const TaskNote = require('../models/TaskNote');
const { DEFAULT_TASK_NOTE_CATEGORY } = require('../models/TaskNote');

const apply = process.argv.includes('--apply');

const run = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/financial-ledger';
  await mongoose.connect(uri);
  console.log(`Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const legacyQuery = { $or: [{ category: { $exists: false } }, { category: null }] };
  const missingCount = await TaskNote.countDocuments(legacyQuery);

  const perCategory = await TaskNote.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);
  console.log('Current category distribution:');
  perCategory.forEach((row) => console.log(`  ${row._id === null ? '(missing)' : row._id}: ${row.count}`));

  const savingsQuery = { category: 'SAVINGS' };
  const savingsCount = await TaskNote.countDocuments(savingsQuery);

  console.log(
    apply
      ? `Applying backfill: ${missingCount} document(s) -> '${DEFAULT_TASK_NOTE_CATEGORY}'; ${savingsCount} 'SAVINGS' document(s) -> 'PRESENT_EXPENSE'`
      : `DRY RUN: ${missingCount} document(s) would be backfilled to '${DEFAULT_TASK_NOTE_CATEGORY}' and ${savingsCount} 'SAVINGS' document(s) renamed to 'PRESENT_EXPENSE' (pass --apply to write)`
  );

  if (apply && missingCount > 0) {
    const result = await TaskNote.updateMany(legacyQuery, { $set: { category: DEFAULT_TASK_NOTE_CATEGORY } });
    console.log(`Backfilled ${result.modifiedCount} document(s).`);
  }

  // Rename migration: the 'SAVINGS' dropdown option was replaced by
  // 'PRESENT_EXPENSE', so legacy documents are remapped to keep their place
  // in the expense bucket instead of orphaning the enum.
  if (apply && savingsCount > 0) {
    const renamed = await TaskNote.updateMany(savingsQuery, { $set: { category: 'PRESENT_EXPENSE' } });
    console.log(`Renamed ${renamed.modifiedCount} 'SAVINGS' document(s) to 'PRESENT_EXPENSE'.`);
  }

  await mongoose.disconnect();
  console.log('Done.');
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err.message);
    process.exit(1);
  });
