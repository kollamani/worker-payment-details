/*
 * Integration test for categorized task notes
 * (category field on TaskNote + /api/task-notes endpoints).
 *
 * Runs against a throw-away in-memory MongoDB, so the real Atlas database is
 * never touched. Covers: category persistence on POST, enum validation,
 * defaulting for backward compatibility, GET mapping + optional server-side
 * category filter, PUT category updates, and per-category amount totals
 * (the numbers the frontend KPI cards display).
 *
 * Run with: node tests/task-note-category.test.js  (from the backend folder)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'task-note-category-test-secret';
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
let admin;
let token;

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures += 1;
    console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const post = (payload) =>
  request(app).post('/api/task-notes').send(payload).set('Authorization', `Bearer ${token}`);

const run = async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('task-note-category-test'));

  app = express();
  app.use(express.json());
  app.use('/api/task-notes', taskNoteRoutes);
  app.use(notFound);
  app.use(errorHandler);

  admin = await Admin.create({ username: 'admina', password: 'password123', name: 'Admin A' });
  token = jwt.sign({ id: admin._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

  console.log('\n[1] POST persists the selected category');
  let res = await post({ description: 'Cash in hand', presentAmount: 100, category: 'PRESENT_HAVING' });
  check('PRESENT_HAVING saved', res.status === 201 && res.body.taskNote.category === 'PRESENT_HAVING', JSON.stringify(res.body));
  res = await post({ description: 'Diesel for the week', presentAmount: 30, category: 'PRESENT_EXPENSE' });
  check('PRESENT_EXPENSE saved', res.status === 201 && res.body.taskNote.category === 'PRESENT_EXPENSE', JSON.stringify(res.body));
  res = await post({ description: 'Milk supply income', presentAmount: 200, category: 'EXPECTED_INCOME' });
  check('EXPECTED_INCOME saved', res.status === 201 && res.body.taskNote.category === 'EXPECTED_INCOME', JSON.stringify(res.body));
  res = await post({ description: 'Upcoming rent', presentAmount: 40, category: 'EXPECTED_EXPENSE' });
  check('EXPECTED_EXPENSE saved', res.status === 201 && res.body.taskNote.category === 'EXPECTED_EXPENSE', JSON.stringify(res.body));

  console.log('\n[2] POST without category defaults to PRESENT_HAVING (backward compatible)');
  res = await post({ description: 'Legacy client task', presentAmount: 50 });
  check('missing category -> PRESENT_HAVING', res.status === 201 && res.body.taskNote.category === 'PRESENT_HAVING', JSON.stringify(res.body));
  res = await post({ description: 'Null category task', presentAmount: 10, category: null });
  check('null category -> PRESENT_HAVING', res.status === 201 && res.body.taskNote.category === 'PRESENT_HAVING', JSON.stringify(res.body));

  console.log('\n[3] POST with an unknown category is rejected');
  res = await post({ description: 'Bad category', presentAmount: 10, category: 'RANDOM_SLICE' });
  check('unknown category -> 400', res.status === 400 && /Category must be one of/.test(res.body.message || ''), `status=${res.status} body=${JSON.stringify(res.body)}`);
  check('nothing created by the failed request', (await TaskNote.countDocuments({ description: 'Bad category' })) === 0);

  console.log('\n[4] GET maps every task with its category (KPI source of truth)');
  res = await request(app).get('/api/task-notes').set('Authorization', `Bearer ${token}`);
  check('returns 200 with all 6 tasks', res.status === 200 && res.body.count === 6, `count=${res.body.count}`);
  const byCategory = {};
  res.body.taskNotes.forEach((taskNote) => {
    byCategory[taskNote.category] = (byCategory[taskNote.category] || 0) + Number(taskNote.presentAmount || 0);
  });
  check('Total Present Having Amount = 160 (100 + 50 + 10)', byCategory.PRESENT_HAVING === 160, JSON.stringify(byCategory));
  check('Total Present Expense = 30', byCategory.PRESENT_EXPENSE === 30, JSON.stringify(byCategory));
  check('Total Expected Income = 200', byCategory.EXPECTED_INCOME === 200, JSON.stringify(byCategory));
  check('Total Expected Expense = 40', byCategory.EXPECTED_EXPENSE === 40, JSON.stringify(byCategory));

  console.log('\n[5] GET ?category= returns only that slice');
  res = await request(app).get('/api/task-notes').query({ category: 'EXPECTED_INCOME' }).set('Authorization', `Bearer ${token}`);
  check('category filter returns 1 task', res.status === 200 && res.body.count === 1 && res.body.taskNotes[0].category === 'EXPECTED_INCOME', `count=${res.body.count}`);
  res = await request(app).get('/api/task-notes').query({ category: 'NOT_A_THING' }).set('Authorization', `Bearer ${token}`);
  check('invalid category query -> 400', res.status === 400 && /Category must be one of/.test(res.body.message || ''), `status=${res.status}`);

  console.log('\n[6] PUT updates the category');
  const notes = (await request(app).get('/api/task-notes').set('Authorization', `Bearer ${token}`)).body.taskNotes;
  const target = notes.find((taskNote) => taskNote.description === 'Legacy client task');
  res = await request(app)
    .put(`/api/task-notes/${target._id}`)
    .send({ category: 'EXPECTED_EXPENSE' })
    .set('Authorization', `Bearer ${token}`);
  check('category updated to EXPECTED_EXPENSE', res.status === 200 && res.body.taskNote.category === 'EXPECTED_EXPENSE', JSON.stringify(res.body));
  check('amounts untouched by category update', Number(res.body.taskNote.presentAmount) === 50);
  res = await request(app).put(`/api/task-notes/${target._id}`).send({ category: 'NOPE' }).set('Authorization', `Bearer ${token}`);
  check('invalid PUT category -> 400', res.status === 400 && /Category must be one of/.test(res.body.message || ''), `status=${res.status}`);

  console.log('\n[7] Legacy documents (created before the field existed) map to the default');
  await TaskNote.create({ description: 'Pre-category doc', presentAmount: 5, createdBy: admin._id });
  const legacyDoc = await TaskNote.findOne({ description: 'Pre-category doc' }).lean();
  check('schema default fills category', legacyDoc.category === 'PRESENT_HAVING', `category=${legacyDoc.category}`);

  console.log('\n[8] Unauthenticated requests are rejected');
  res = await request(app).get('/api/task-notes');
  check('no token -> 401', res.status === 401, `status=${res.status}`);

  console.log('\n[9] PRESENT_EXPENSE round-trips (Savings was replaced by Present Expense)');
  res = await post({ description: 'Site materials', presentAmount: 75, category: 'PRESENT_EXPENSE' });
  check('PRESENT_EXPENSE saved', res.status === 201 && res.body.taskNote.category === 'PRESENT_EXPENSE', JSON.stringify(res.body));
  res = await request(app).get('/api/task-notes').query({ category: 'PRESENT_EXPENSE' }).set('Authorization', `Bearer ${token}`);
  check(
    'PRESENT_EXPENSE filter returns exactly 2 tasks',
    res.status === 200 && res.body.count === 2 && res.body.taskNotes.every((taskNote) => taskNote.category === 'PRESENT_EXPENSE'),
    `count=${res.body.count}`
  );
  res = await post({ description: 'Old savings task', presentAmount: 5, category: 'SAVINGS' });
  check('removed SAVINGS category -> 400', res.status === 400 && /Category must be one of/.test(res.body.message || ''), `status=${res.status}`);
  check('nothing created by the rejected SAVINGS request', (await TaskNote.countDocuments({ description: 'Old savings task' })) === 0);


  console.log('\n[10] Summary metrics: a completed task becomes Present Expense');
  const beforeSummary = (await request(app).get('/api/task-notes').set('Authorization', `Bearer ${token}`)).body.summary;
  check(
    'GET returns a summary payload',
    !!beforeSummary && typeof beforeSummary.totalPresentHaving === 'number' && typeof beforeSummary.totalExpense === 'number',
    JSON.stringify(beforeSummary)
  );
  const pendingExpectedExpense = beforeSummary.totalExpectedExpense;
  check('pending Expected Expense total is tracked', pendingExpectedExpense === 90, `got=${pendingExpectedExpense}`);

  const rentTasks = (await request(app).get('/api/task-notes').query({ category: 'EXPECTED_EXPENSE' }).set('Authorization', `Bearer ${token}`)).body.taskNotes;
  const rentTask = rentTasks.find((taskNote) => taskNote.description === 'Upcoming rent');
  check('found the pending rent task', !!rentTask);

  await request(app).put(`/api/task-notes/${rentTask._id}`).send({ status: 'completed' }).set('Authorization', `Bearer ${token}`);
  const afterSummary = (await request(app).get('/api/task-notes').set('Authorization', `Bearer ${token}`)).body.summary;

  check(
    'Total Expense grows by the completed amount (40)',
    afterSummary.totalExpense === beforeSummary.totalExpense + 40,
    `before=${beforeSummary.totalExpense} after=${afterSummary.totalExpense}`
  );
  check(
    'Total Present Having drops by the completed amount (40)',
    afterSummary.totalPresentHaving === beforeSummary.totalPresentHaving - 40,
    `before=${beforeSummary.totalPresentHaving} after=${afterSummary.totalPresentHaving}`
  );
  check(
    'pending Expected Expense drops by 40',
    afterSummary.totalExpectedExpense === beforeSummary.totalExpectedExpense - 40,
    `before=${beforeSummary.totalExpectedExpense} after=${afterSummary.totalExpectedExpense}`
  );
  check('completed count increments', afterSummary.counts.completed === beforeSummary.counts.completed + 1, JSON.stringify(afterSummary.counts));
  check('no Target-derived fields are returned', !('targetAmount' in rentTask) && !('totalAmount' in rentTask) && !('remainingBalance' in rentTask), JSON.stringify(Object.keys(rentTask)));

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
