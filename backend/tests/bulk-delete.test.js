/*
 * Integration test for the worker-scoped bulk delete endpoint
 * (DELETE /api/transactions/bulk).
 *
 * Runs against a throw-away in-memory MongoDB (mongodb-memory-server), so the
 * real Atlas database is never touched. Covers:
 *   - selecting individual transaction ids,
 *   - member/worker scoping (ids from another worker are skipped),
 *   - admin isolation,
 *   - query-string comma-separated ids,
 *   - validation and NoSQL-injection guards,
 *   - the response contract,
 *   - paymentMethod persistence on POST /api/transactions.
 *
 * Run with: node tests/bulk-delete.test.js  (from the backend folder)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bulk-delete-test-secret';
process.env.NODE_ENV = 'test';
process.env.MONGOMS_LAUNCH_TIMEOUT = process.env.MONGOMS_LAUNCH_TIMEOUT || '120000';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const Admin = require('../models/Admin');
const Member = require('../models/Member');
const Transaction = require('../models/Transaction');
const transactionRoutes = require('../routes/transactions');
const memberRoutes = require('../routes/members');
const { notFound, errorHandler } = require('../middleware/errorHandler');

let app;
let mongod;
let adminA;
let adminB;
let tokenA;
let tokenB;
let workerOne;
let workerTwo;
let workerOtherAdmin;

const utcMidnight = (dateKey) => new Date(`${dateKey}T00:00:00.000Z`);

const tx = (member, createdBy, dateKey, overrides = {}) => ({
  member: member._id,
  villageName: member.villageName,
  date: utcMidnight(dateKey),
  type: 'deposit',
  amount: 100,
  createdBy,
  ...overrides,
});

const seedAll = async () => {
  await Promise.all([Admin.deleteMany({}), Member.deleteMany({}), Transaction.deleteMany({})]);

  adminA = await Admin.create({ username: 'admina', password: 'password123', name: 'Admin A' });
  adminB = await Admin.create({ username: 'adminb', password: 'password123', name: 'Admin B' });
  tokenA = jwt.sign({ id: adminA._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  tokenB = jwt.sign({ id: adminB._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

  workerOne = await Member.create({
    jNo: 'J1',
    workerName: 'Worker One',
    admin: 'Kiran',
    villageName: 'Rampur',
    createdBy: adminA._id,
  });
  workerTwo = await Member.create({
    jNo: 'J2',
    workerName: 'Worker Two',
    admin: 'Kiran',
    villageName: 'Sundarpur',
    createdBy: adminA._id,
  });
  workerOtherAdmin = await Member.create({
    jNo: 'J3',
    workerName: 'Other Worker',
    admin: 'Suresh',
    villageName: 'Rampur',
    createdBy: adminB._id,
  });

  await Transaction.insertMany([
    tx(workerOne, adminA._id, '2026-09-10'),
    tx(workerOne, adminA._id, '2026-09-11', { type: 'withdrawal', amount: 40 }),
    tx(workerOne, adminA._id, '2026-09-12'),
    tx(workerTwo, adminA._id, '2026-09-10'),
    tx(workerTwo, adminA._id, '2026-09-11'),
    tx(workerOtherAdmin, adminB._id, '2026-09-10'),
  ]);
};

const adminATxCount = () => Transaction.countDocuments({ createdBy: adminA._id });
const adminBTxCount = () => Transaction.countDocuments({ createdBy: adminB._id });

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures += 1;
    console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const run = async () => {
  mongod = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongod.getUri('bulk-delete-test'));

  app = express();
  app.use(express.json());
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/members', memberRoutes);
  app.use(notFound);
  app.use(errorHandler);

  console.log('\n[1] Delete an explicit set of transaction ids');
  await seedAll();
  const workerOneTxs = await Transaction.find({ member: workerOne._id }).sort({ date: 1 }).lean();
  let res = await request(app)
    .delete('/api/transactions/bulk')
    .send({ ids: [workerOneTxs[0]._id.toString(), workerOneTxs[2]._id.toString()] })
    .set('Authorization', `Bearer ${tokenA}`);
  check('returns 200', res.status === 200, `status=${res.status} body=${JSON.stringify(res.body)}`);
  check('deletedCount === 2', res.body.deletedCount === 2, `deletedCount=${res.body.deletedCount}`);
  check('count mirrors deletedCount', res.body.count === res.body.deletedCount);
  check('requestedCount === 2', res.body.requestedCount === 2, `requestedCount=${res.body.requestedCount}`);
  check('skippedCount === 0', res.body.skippedCount === 0, `skippedCount=${res.body.skippedCount}`);
  check('remaining worker-one rows === 1', (await Transaction.countDocuments({ member: workerOne._id })) === 1);
  check('admin A total is now 3', (await adminATxCount()) === 3, `adminA remaining=${await adminATxCount()}`);
  check("admin B's row untouched", (await adminBTxCount()) === 1);

  console.log('\n[2] memberId scoping skips ids from another worker');
  await seedAll();
  const allAdminATxs = await Transaction.find({ createdBy: adminA._id }).sort({ date: 1 }).lean();
  res = await request(app)
    .delete('/api/transactions/bulk')
    .send({ ids: allAdminATxs.map((t) => t._id.toString()), memberId: workerOne._id.toString() })
    .set('Authorization', `Bearer ${tokenA}`);
  check('deletes only worker-one rows (3)', res.status === 200 && res.body.deletedCount === 3, `status=${res.status} deleted=${res.body.deletedCount}`);
  check('reports skipped ids (2)', res.body.skippedCount === 2, `skipped=${res.body.skippedCount}`);
  check('worker-two rows untouched (2)', (await Transaction.countDocuments({ member: workerTwo._id })) === 2);

  console.log('\n[3] Admin isolation');
  await seedAll();
  const adminBTx = await Transaction.findOne({ createdBy: adminB._id }).lean();
  res = await request(app)
    .delete('/api/transactions/bulk')
    .send({ ids: [adminBTx._id.toString()] })
    .set('Authorization', `Bearer ${tokenA}`);
  check('deleting another admin id yields 200 / 0 deleted', res.status === 200 && res.body.deletedCount === 0, `status=${res.status} deleted=${res.body.deletedCount}`);
  check("admin B's row still exists", (await adminBTxCount()) === 1);

  console.log('\n[4] Query-string comma-separated ids are accepted');
  await seedAll();
  const idsForQuery = await Transaction.find({ member: workerTwo._id }).sort({ date: 1 }).lean();
  res = await request(app)
    .delete('/api/transactions/bulk')
    .query({ ids: idsForQuery.map((t) => t._id.toString()).join(',') })
    .set('Authorization', `Bearer ${tokenA}`);
  check('query variant deletes 2', res.status === 200 && res.body.deletedCount === 2, `status=${res.status} deleted=${res.body.deletedCount}`);

  console.log('\n[5] Validation and injection guards');
  await seedAll();
  const before = await adminATxCount();
  res = await request(app)
    .delete('/api/transactions/bulk')
    .send({ ids: [] })
    .set('Authorization', `Bearer ${tokenA}`);
  check('empty ids -> 400', res.status === 400 && /at least one/.test(res.body.message || ''), `status=${res.status}`);

  res = await request(app)
    .delete('/api/transactions/bulk')
    .send({ ids: ['not-an-object-id'] })
    .set('Authorization', `Bearer ${tokenA}`);
  check('invalid id -> 400', res.status === 400 && /Invalid transaction id/.test(res.body.message || ''), `status=${res.status}`);

  res = await request(app)
    .delete('/api/transactions/bulk')
    .send({ ids: Array.from({ length: 501 }, (_, i) => new mongoose.Types.ObjectId().toString()) })
    .set('Authorization', `Bearer ${tokenA}`);
  check('more than 500 ids -> 400', res.status === 400 && /maximum of 500/.test(res.body.message || ''), `status=${res.status}`);

  res = await request(app)
    .delete('/api/transactions/bulk')
    .send({ ids: [new mongoose.Types.ObjectId().toString()], memberId: 'bad-member' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('invalid memberId -> 400', res.status === 400 && /Invalid memberId/.test(res.body.message || ''), `status=${res.status}`);

  res = await request(app)
    .delete('/api/transactions/bulk')
    .send({ ids: { $ne: null } })
    .set('Authorization', `Bearer ${tokenA}`);
  check('operator object ids -> 400 (no injection)', res.status === 400, `status=${res.status} body=${JSON.stringify(res.body)}`);

  res = await request(app)
    .delete('/api/transactions/bulk')
    .query({ memberId: { $ne: null }, ids: new mongoose.Types.ObjectId().toString() })
    .set('Authorization', `Bearer ${tokenA}`);
  check('operator object query -> 400 (no injection)', res.status === 400, `status=${res.status}`);
  check('failed validations deleted nothing', (await adminATxCount()) === before, `before=${before} after=${await adminATxCount()}`);

  console.log('\n[6] Unauthenticated requests are rejected');
  res = await request(app)
    .delete('/api/transactions/bulk')
    .send({ ids: [new mongoose.Types.ObjectId().toString()] });
  check('no token -> 401', res.status === 401, `status=${res.status}`);

  console.log('\n[7] paymentMethod is persisted and returned for worker details');
  await seedAll();
  res = await request(app)
    .post('/api/transactions')
    .send({ member: workerOne._id.toString(), type: 'deposit', amount: 250, date: '2026-09-20', paymentMethod: 'upi', note: 'UPI collect' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('create with paymentMethod upi -> 201', res.status === 201 && res.body.transaction?.paymentMethod === 'upi', `status=${res.status} body=${JSON.stringify(res.body)}`);

  res = await request(app)
    .post('/api/transactions')
    .send({ member: workerOne._id.toString(), type: 'deposit', amount: 100, date: '2026-09-20', paymentMethod: 'bitcoin' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('unsupported paymentMethod -> 400', res.status === 400 && /paymentMethod must be one of/.test(res.body.message || ''), `status=${res.status}`);

  res = await request(app)
    .post('/api/transactions')
    .send({ member: workerOne._id.toString(), type: 'deposit', amount: 100, date: '2026-09-20' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('omitted paymentMethod defaults to cash', res.status === 201 && res.body.transaction?.paymentMethod === 'cash', `status=${res.status}`);

  res = await request(app)
    .get(`/api/members/${workerOne._id}/summary`)
    .set('Authorization', `Bearer ${tokenA}`);
  const upiRow = (res.body.timeline || []).find((t) => t.note === 'UPI collect');
  check('member summary timeline includes paymentMethod', res.status === 200 && upiRow?.paymentMethod === 'upi', `status=${res.status} paymentMethod=${upiRow?.paymentMethod}`);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  return failures;
};

run()
  .then(async (failures) => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('Test run crashed:', err);
    try {
      await mongoose.disconnect();
      if (mongod) await mongod.stop();
    } catch {}
    process.exit(1);
  });
