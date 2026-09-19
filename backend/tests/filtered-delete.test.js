/*
 * Integration test for the Danger-Zone filtered delete endpoint
 * (DELETE|POST /api/transactions/filtered-delete).
 *
 * Runs against a throw-away in-memory MongoDB (mongodb-memory-server), so the
 * real Atlas database is never touched. Covers: date boundaries (inclusive
 * start & end days), worker / village / member scoping, admin isolation,
 * validation errors, the JSON-body (POST) variant, and the response contract
 * { success, count, deletedCount, message }.
 *
 * Run with: node tests/filtered-delete.test.js  (from the backend folder)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'filtered-delete-test-secret';
process.env.NODE_ENV = 'test';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const Admin = require('../models/Admin');
const Member = require('../models/Member');
const Transaction = require('../models/Transaction');
const transactionRoutes = require('../routes/transactions');
const { notFound, errorHandler } = require('../middleware/errorHandler');

let app;
let mongod;
let adminA;
let adminB;
let tokenA;
let tokenB;
let memberKiranRampur;
let memberKiranSundar;
let memberSureshRampur;
let memberOtherAdmin;

const utcMidnight = (dateKey) => new Date(`${dateKey}T00:00:00.000Z`);

const seedAll = async () => {
  await Promise.all([Admin.deleteMany({}), Member.deleteMany({}), Transaction.deleteMany({})]);

  adminA = await Admin.create({ username: 'admina', password: 'password123', name: 'Admin A' });
  adminB = await Admin.create({ username: 'adminb', password: 'password123', name: 'Admin B' });
  tokenA = jwt.sign({ id: adminA._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  tokenB = jwt.sign({ id: adminB._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

  memberKiranRampur = await Member.create({
    jNo: 'J1', workerName: 'Worker One', admin: 'Kiran', villageName: 'Rampur', createdBy: adminA._id,
  });
  memberKiranSundar = await Member.create({
    jNo: 'J2', workerName: 'Worker Two', admin: 'Kiran', villageName: 'Sundarpur', createdBy: adminA._id,
  });
  memberSureshRampur = await Member.create({
    jNo: 'J3', workerName: 'Worker Three', admin: 'Suresh', villageName: 'Rampur', createdBy: adminA._id,
  });
  memberOtherAdmin = await Member.create({
    jNo: 'J4', workerName: 'Other Member', admin: 'Kiran', villageName: 'Rampur', createdBy: adminB._id,
  });

  const tx = (member, createdBy, dateKey) => ({
    member: member._id,
    villageName: member.villageName,
    date: utcMidnight(dateKey),
    type: 'deposit',
    amount: 100,
    createdBy,
  });

  // Admin A owns 6 in-range transactions (2026-09-10 .. 2026-09-15) plus the
  // two out-of-range boundary transactions (09-09 before, 09-16 after).
  await Transaction.insertMany([
    tx(memberKiranRampur, adminA._id, '2026-09-09'), // before range  (Kiran / Rampur)
    tx(memberKiranRampur, adminA._id, '2026-09-10'), // start day     (Kiran / Rampur)
    tx(memberKiranRampur, adminA._id, '2026-09-12'), // middle        (Kiran / Rampur)
    tx(memberKiranRampur, adminA._id, '2026-09-15'), // end day       (Kiran / Rampur)
    tx(memberKiranRampur, adminA._id, '2026-09-16'), // after range   (Kiran / Rampur)
    tx(memberKiranSundar, adminA._id, '2026-09-12'), // middle        (Kiran / Sundarpur)
    tx(memberKiranSundar, adminA._id, '2026-09-15'), // end day       (Kiran / Sundarpur)
    tx(memberSureshRampur, adminA._id, '2026-09-12'), // middle       (Suresh / Rampur)
    tx(memberOtherAdmin, adminB._id, '2026-09-12'), // other admin   (Kiran / Rampur)
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
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('filtered-delete-test'));

  app = express();
  app.use(express.json());
  app.use('/api/transactions', transactionRoutes);
  app.use(notFound);
  app.use(errorHandler);

  console.log('\n[1] Plain date-range delete (DELETE /filtered-delete)');
  await seedAll();
  let res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('returns 200', res.status === 200, `status=${res.status} body=${JSON.stringify(res.body)}`);
  check('success is true', res.body.success === true);
  check('count === 6 (3 Kiran/Rampur + 2 Kiran/Sundarpur + 1 Suresh/Rampur)', res.body.count === 6, `count=${res.body.count}`);
  check('deletedCount mirrors count', res.body.deletedCount === 6, `deletedCount=${res.body.deletedCount}`);
  check('message is the spec message', res.body.message === 'Filtered transactions deleted successfully!', `message="${res.body.message}"`);
  const survivingKeys = (await Transaction.find({ createdBy: adminA._id }).lean())
    .map((t) => t.date.toISOString().slice(0, 10))
    .sort();
  check('survivors are exactly 09-09 & 09-16 (end day included, day after excluded)', JSON.stringify(survivingKeys) === JSON.stringify(['2026-09-09', '2026-09-16']), `survivors=${survivingKeys}`);
  check("other admin's data untouched", (await adminBTxCount()) === 1, `adminB remaining=${await adminBTxCount()}`);

  console.log('\n[2] Worker-name scoping (case-insensitive)');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15', worker: 'kiran' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('returns 200 with count 5 (Kiran members only)', res.status === 200 && res.body.count === 5, `status=${res.status} count=${res.body.count}`);
  check("Suresh's transaction survives", (await Transaction.countDocuments({ createdBy: adminA._id, member: memberSureshRampur._id })) === 1);

  console.log('\n[3] Village scoping (case-insensitive)');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15', village: 'rampur' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('returns 200 with count 4 (Rampur members only)', res.status === 200 && res.body.count === 4, `status=${res.status} count=${res.body.count}`);
  check('Sundarpur transactions survive', (await Transaction.countDocuments({ createdBy: adminA._id, villageName: 'Sundarpur' })) === 2);

  console.log('\n[4] Worker + village combined scoping');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15', worker: 'Kiran', village: 'Rampur' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('returns 200 with count 3 (Kiran/Rampur only)', res.status === 200 && res.body.count === 3, `status=${res.status} count=${res.body.count}`);
  check('Suresh + Sundarpur transactions survive', (await adminATxCount()) === 5, `adminA remaining=${await adminATxCount()}`);

  console.log('\n[5] Unknown worker must delete nothing');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15', worker: 'Ghost Worker' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('returns 200 with count 0', res.status === 200 && res.body.count === 0, `status=${res.status} count=${res.body.count}`);
  check('zero-delete message', res.body.message === 'No transactions matched the selected filters.', `message="${res.body.message}"`);
  check('no data was deleted', (await adminATxCount()) === 8, `adminA remaining=${await adminATxCount()}`);

  console.log('\n[6] memberId / workerId (member ObjectId) scoping');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15', memberId: memberKiranSundar._id.toString() })
    .set('Authorization', `Bearer ${tokenA}`);
  check('memberId delete returns count 2', res.status === 200 && res.body.count === 2, `status=${res.status} count=${res.body.count}`);
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15', workerId: memberKiranRampur._id.toString() })
    .set('Authorization', `Bearer ${tokenA}`);
  check('workerId-as-memberId delete returns count 3', res.status === 200 && res.body.count === 3, `status=${res.status} count=${res.body.count}`);

  console.log('\n[7] POST JSON body payload variant (/filter-delete)');
  await seedAll();
  res = await request(app)
    .post('/api/transactions/filter-delete')
    .send({ startDate: '2026-09-10', endDate: '2026-09-15', village: 'Sundarpur' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('POST body delete returns count 2', res.status === 200 && res.body.count === 2, `status=${res.status} count=${res.body.count} body=${JSON.stringify(res.body)}`);

  console.log('\n[8] Full ISO date strings are accepted');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10T00:00:00.000Z', endDate: '2026-09-15T00:00:00.000Z' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('ISO dates return count 6', res.status === 200 && res.body.count === 6, `status=${res.status} count=${res.body.count}`);

  console.log('\n[9] Validation errors');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('missing endDate -> 400', res.status === 400 && /startDate and endDate/.test(res.body.message || ''), `status=${res.status}`);
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-16', endDate: '2026-09-10' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('start after end -> 400', res.status === 400 && /after end date/.test(res.body.message || ''), `status=${res.status}`);
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-02-31', endDate: '2026-09-10' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('impossible calendar date -> 400 (no silent rollover)', res.status === 400 && /Invalid startDate/.test(res.body.message || ''), `status=${res.status} body=${JSON.stringify(res.body)}`);
  check('nothing deleted by failed validations', (await adminATxCount()) === 8);

  console.log('\n[10] Admin isolation (tokens scope every delete)');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15' })
    .set('Authorization', `Bearer ${tokenB}`);
  check('admin B deletes only its own row (count 1)', res.status === 200 && res.body.count === 1, `status=${res.status} count=${res.body.count}`);
  check("admin A's 8 rows untouched", (await adminATxCount()) === 8, `adminA remaining=${await adminATxCount()}`);

  console.log('\n[11] adminId guard');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15', adminId: adminB._id.toString() })
    .set('Authorization', `Bearer ${tokenA}`);
  check('mismatched adminId -> 403', res.status === 403, `status=${res.status}`);
  res = await request(app)
    .delete('/api/transactions/filtered-delete')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15', adminId: adminA._id.toString() })
    .set('Authorization', `Bearer ${tokenA}`);
  check('matching adminId proceeds (count 6)', res.status === 200 && res.body.count === 6, `status=${res.status} count=${res.body.count}`);

  console.log('\n[12] Legacy route aliases still map to the fixed handler');
  await seedAll();
  res = await request(app)
    .delete('/api/transactions/delete-range')
    .query({ startDate: '2026-09-10', endDate: '2026-09-15' })
    .set('Authorization', `Bearer ${tokenA}`);
  check('DELETE /delete-range works (count 6)', res.status === 200 && res.body.count === 6, `status=${res.status} count=${res.body.count}`);

  console.log('\n[13] Unauthenticated requests are rejected');
  res = await request(app).delete('/api/transactions/filtered-delete').query({ startDate: '2026-09-10', endDate: '2026-09-15' });
  check('no token -> 401', res.status === 401, `status=${res.status}`);

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
