/*
 * Integration test for the calculated financial-breakdown metrics returned by
 * GET /api/task-notes -> summary (the numbers the toggleable
 * "Show Summary Metrics" panel displays).
 *
 * Covers: the four spec formulas, the existing bucket totals staying intact,
 * completing a pending Expected Expense being metric-neutral, and the
 * null/undefined safety net for legacy documents missing `presentAmount`.
 *
 * Runs against a throw-away in-memory MongoDB, so the real Atlas database is
 * never touched.
 *
 * Run with: node tests/task-note-summary-metrics.test.js  (from the backend folder)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'task-note-summary-metrics-test-secret';
process.env.NODE_ENV = 'test';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const Admin = require('../models/Admin');
const TaskNote = require('../models/TaskNote');
const taskNoteRoutes = require('../routes/task-notes');
const { notFound, errorHandler } = require('../middleware/errorHandler');

let app;
let mongod;
let token;
let secondToken;

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures += 1;
    console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`);
  }
};

const closeTo = (actual, expected) => Math.abs(Number(actual) - expected) < 1e-9;

const METRIC_KEYS = ['havingSavings', 'overallIncome', 'entireExpense', 'totalExpectedSavings'];

const getSummary = async (bearer = token) => {
  const res = await request(app).get('/api/task-notes').set('Authorization', `Bearer ${bearer}`);
  return res.body.summary || {};
};

const post = (payload) =>
  request(app).post('/api/task-notes').send(payload).set('Authorization', `Bearer ${token}`);

const complete = (id, bearer = token) =>
  request(app).put(`/api/task-notes/${id}`).send({ status: 'completed' }).set('Authorization', `Bearer ${bearer}`);

const allFinite = (summary) => METRIC_KEYS.every((key) => Number.isFinite(summary[key]));

const run = async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('task-note-summary-metrics-test'));

  app = express();
  app.use(express.json());
  app.use('/api/task-notes', taskNoteRoutes);
  app.use(notFound);
  app.use(errorHandler);

  const admin = await Admin.create({ username: 'adminmetrics', password: 'password123', name: 'Admin Metrics' });
  token = jwt.sign({ id: admin._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const secondAdmin = await Admin.create({ username: 'adminlegacy', password: 'password123', name: 'Admin Legacy' });
  secondToken = jwt.sign({ id: secondAdmin._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

  console.log('\n[1] No tasks -> every calculated metric is 0 and finite');
  const empty = await getSummary();
  check('GET returns the four calculated keys', METRIC_KEYS.every((key) => key in empty), JSON.stringify(empty));
  check('all four metrics are finite numbers', allFinite(empty), JSON.stringify(empty));
  check('savings are 0 on an empty ledger', empty.havingSavings === 0 && empty.totalExpectedSavings === 0, JSON.stringify(empty));

  console.log('\n[2] Seed one task per bucket');
  const having = await post({ description: 'Cash in hand', presentAmount: 1000, category: 'PRESENT_HAVING' });
  check('PRESENT_HAVING created', having.status === 201, JSON.stringify(having.body));
  const presentExpense = await post({ description: 'Diesel bill', presentAmount: 200, category: 'PRESENT_EXPENSE' });
  check('PRESENT_EXPENSE created', presentExpense.status === 201, JSON.stringify(presentExpense.body));
  const expectedIncome = await post({ description: 'Milk supply income', presentAmount: 500, category: 'EXPECTED_INCOME' });
  check('EXPECTED_INCOME created', expectedIncome.status === 201, JSON.stringify(expectedIncome.body));
  const expectedExpense = await post({ description: 'Upcoming rent', presentAmount: 300, category: 'EXPECTED_EXPENSE' });
  check('EXPECTED_EXPENSE created', expectedExpense.status === 201, JSON.stringify(expectedExpense.body));

  // Present Expense only counts completed (filed) work.
  await complete(presentExpense.body.taskNote._id);

  const summary = await getSummary();
  check('Present Having bucket = 1000', summary.presentIncome === 1000, JSON.stringify(summary));
  check('Present Expense bucket = 200 (completed)', summary.totalExpense === 200, JSON.stringify(summary));
  check('Expected Income bucket = 500 (pending)', summary.totalExpectedIncome === 500, JSON.stringify(summary));
  check('Expected Expense bucket = 300 (pending)', summary.totalExpectedExpense === 300, JSON.stringify(summary));

  console.log('\n[3] The four spec formulas');
  check('Having Savings = 1000 - 300 - 200 = 500', closeTo(summary.havingSavings, 500), `got=${summary.havingSavings}`);
  check('Overall Income = 1000 + 500 = 1500', closeTo(summary.overallIncome, 1500), `got=${summary.overallIncome}`);
  check('Entire Expense = 300 + 200 = 500', closeTo(summary.entireExpense, 500), `got=${summary.entireExpense}`);
  check(
    'Total Expected Savings = 1500 - 500 = 1000',
    closeTo(summary.totalExpectedSavings, 1000),
    `got=${summary.totalExpectedSavings}`
  );
  check(
    'aliases presentExpense / expectedExpense mirror the buckets',
    summary.presentExpense === 200 && summary.expectedExpense === 300,
    JSON.stringify(summary)
  );

  console.log('\n[4] Completing the pending Expected Expense is metric-neutral');
  await complete(expectedExpense.body.taskNote._id);
  const after = await getSummary();
  check('Expected Expense bucket drops to 0', after.totalExpectedExpense === 0, JSON.stringify(after));
  check('Present Expense bucket grows to 500', after.totalExpense === 500, JSON.stringify(after));
  check('Having Savings unchanged (500)', closeTo(after.havingSavings, 500), `got=${after.havingSavings}`);
  check('Overall Income unchanged (1500)', closeTo(after.overallIncome, 1500), `got=${after.overallIncome}`);
  check('Entire Expense unchanged (500)', closeTo(after.entireExpense, 500), `got=${after.entireExpense}`);
  check('Total Expected Savings unchanged (1000)', closeTo(after.totalExpectedSavings, 1000), `got=${after.totalExpectedSavings}`);
  check(
    'existing card totals are untouched',
    after.totalPresentHaving === 500 && after.totalExpectedIncome === 500,
    JSON.stringify(after)
  );

  console.log('\n[5] Overspending yields a negative but finite savings balance');
  const repair = await post({ description: 'Emergency repair', presentAmount: 900, category: 'PRESENT_EXPENSE' });
  await complete(repair.body.taskNote._id);
  const overspent = await getSummary();
  check('Having Savings is negative (-400)', closeTo(overspent.havingSavings, -400), `got=${overspent.havingSavings}`);
  check('no NaN/Infinity leaks into any metric', allFinite(overspent), JSON.stringify(overspent));

  console.log('\n[6] Legacy documents missing presentAmount do not poison the totals');
  // Bypasses Mongoose validation on purpose: simulates pre-schema rows.
  const legacyOwner = await Admin.findOne({ username: 'adminlegacy' });
  await TaskNote.collection.insertOne({
    category: 'PRESENT_HAVING',
    description: 'Legacy row without an amount',
    status: 'open',
    createdBy: legacyOwner._id,
  });
  await TaskNote.collection.insertOne({
    category: 'PRESENT_EXPENSE',
    description: 'Legacy completed row without an amount',
    status: 'completed',
    createdBy: legacyOwner._id,
  });
  const legacy = await getSummary(secondToken);
  check('legacy summary is finite', allFinite(legacy), JSON.stringify(legacy));
  check(
    'missing amounts count as 0',
    legacy.havingSavings === 0 &&
      legacy.overallIncome === 0 &&
      legacy.entireExpense === 0 &&
      legacy.totalExpectedSavings === 0,
    JSON.stringify(legacy)
  );
  check('legacy rows are still counted as tasks', legacy.counts.total === 2, JSON.stringify(legacy.counts));

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
