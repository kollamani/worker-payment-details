/*
 * Integration test for the Task Note composer extras
 * (priority / assignedTo / reminderAt on /api/task-notes).
 *
 * Runs against a throw-away in-memory MongoDB, so the real Atlas database is
 * never touched. Covers: defaulting for legacy clients, persistence of all
 * three fields, enum / member-reference / date validation on POST and PUT,
 * clearing with null, cross-account member references being rejected, and the
 * summary metrics staying intact.
 *
 * Run with: node tests/task-note-details.test.js  (from the backend folder)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'task-note-details-test-secret';
process.env.NODE_ENV = 'test';

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const Admin = require('../models/Admin');
const Member = require('../models/Member');
const TaskNote = require('../models/TaskNote');
const taskNoteRoutes = require('../routes/task-notes');
const { notFound, errorHandler } = require('../middleware/errorHandler');

let app;
let mongod;
let admin;
let otherAdmin;
let member;
let otherMember;
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
const put = (id, payload) =>
  request(app).put(`/api/task-notes/${id}`).send(payload).set('Authorization', `Bearer ${token}`);
const list = () => request(app).get('/api/task-notes').set('Authorization', `Bearer ${token}`);

const run = async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('task-note-details-test'));

  app = express();
  app.use(express.json());
  app.use('/api/task-notes', taskNoteRoutes);
  app.use(notFound);
  app.use(errorHandler);

  admin = await Admin.create({ username: 'detailadmin', password: 'password123', name: 'Detail Admin' });
  otherAdmin = await Admin.create({ username: 'otherdetail', password: 'password123', name: 'Other Admin' });
  token = jwt.sign({ id: admin._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });

  member = await Member.create({
    jNo: 'J-1',
    workerName: 'Ravi Kumar',
    admin: 'Detail Admin',
    createdBy: admin._id,
  });
  otherMember = await Member.create({
    jNo: 'J-2',
    workerName: 'Other Worker',
    admin: 'Other Admin',
    createdBy: otherAdmin._id,
  });

  console.log('\n[1] Legacy payload still works and defaults the new fields');
  let res = await post({ description: 'Legacy task', presentAmount: 25 });
  check('POST without the new fields succeeds', res.status === 201, JSON.stringify(res.body));
  check('priority defaults to MEDIUM', res.body.taskNote?.priority === 'MEDIUM', `got=${res.body.taskNote?.priority}`);
  check('assignedTo defaults to null', res.body.taskNote?.assignedTo === null);
  check('reminderAt defaults to null', res.body.taskNote?.reminderAt === null);

  console.log('\n[2] Priority ladder persists, unknown values are rejected');
  for (const priority of ['HIGH', 'LOW', 'CRITICAL']) {
    res = await post({ description: `${priority} task`, presentAmount: 10, priority });
    check(`${priority} saved`, res.status === 201 && res.body.taskNote?.priority === priority, `status=${res.status}`);
  }
  res = await post({ description: 'Bad priority', presentAmount: 10, priority: 'urgent' });
  check(
    'unknown priority -> 400',
    res.status === 400 && /Priority must be one of/.test(res.body.message || ''),
    `status=${res.status}`
  );
  check('rejected priority created nothing', (await TaskNote.countDocuments({ description: 'Bad priority' })) === 0);

  console.log('\n[3] Assigned member is validated and persisted');
  res = await post({
    description: 'Assign to Ravi',
    presentAmount: 40,
    assignedTo: member._id.toString(),
  });
  check(
    'member id saved as a reference',
    res.status === 201 && String(res.body.taskNote?.assignedTo) === member._id.toString(),
    JSON.stringify(res.body.taskNote?.assignedTo)
  );
  const assignedDoc = await TaskNote.findById(res.body.taskNote._id).populate('assignedTo');
  check('reference populates to the member', assignedDoc?.assignedTo?.workerName === 'Ravi Kumar');

  res = await post({ description: 'Foreign member', presentAmount: 5, assignedTo: otherMember._id.toString() });
  check(
    "another account's member -> 400",
    res.status === 400 && /Assigned member not found/.test(res.body.message || ''),
    `status=${res.status}`
  );
  res = await post({ description: 'Ghost member', presentAmount: 5, assignedTo: new mongoose.Types.ObjectId().toString() });
  check('unknown member id -> 400', res.status === 400 && /Assigned member not found/.test(res.body.message || ''));
  res = await post({ description: 'Malformed member', presentAmount: 5, assignedTo: 'not-an-id' });
  check(
    'malformed member id -> 400',
    res.status === 400 && /valid member id/.test(res.body.message || ''),
    `status=${res.status}`
  );
  check(
    'no documents were created by the rejected assignments',
    (await TaskNote.countDocuments({ description: { $in: ['Foreign member', 'Ghost member', 'Malformed member'] } })) === 0
  );

  console.log('\n[4] Reminder timestamp is stored as a real date');
  const reminderIso = '2030-01-02T03:04:00.000Z';
  res = await post({ description: 'Call the supplier', presentAmount: 15, reminderAt: reminderIso });
  check('reminder saved', res.status === 201, JSON.stringify(res.body));
  check(
    'reminder round-trips as the same instant',
    new Date(res.body.taskNote?.reminderAt).toISOString() === reminderIso,
    String(res.body.taskNote?.reminderAt)
  );
  const reminderId = res.body.taskNote._id;
  res = await post({ description: 'Bad reminder', presentAmount: 5, reminderAt: 'not-a-date' });
  check(
    'unparseable reminder -> 400',
    res.status === 400 && /valid date and time/.test(res.body.message || ''),
    `status=${res.status}`
  );
  check('rejected reminder created nothing', (await TaskNote.countDocuments({ description: 'Bad reminder' })) === 0);

  console.log('\n[5] PUT updates, clears and re-validates the extras');
  res = await put(reminderId, {
    priority: 'HIGH',
    assignedTo: member._id.toString(),
    reminderAt: '2031-05-06T07:08:00.000Z',
  });
  check(
    'PUT stores all three fields',
    res.status === 200 &&
      res.body.taskNote?.priority === 'HIGH' &&
      String(res.body.taskNote?.assignedTo) === member._id.toString() &&
      new Date(res.body.taskNote?.reminderAt).toISOString() === '2031-05-06T07:08:00.000Z',
    JSON.stringify(res.body.taskNote)
  );
  res = await put(reminderId, { assignedTo: null, reminderAt: null });
  check(
    'PUT with null clears the assignee + reminder but keeps the priority',
    res.status === 200 &&
      res.body.taskNote?.assignedTo === null &&
      res.body.taskNote?.reminderAt === null &&
      res.body.taskNote?.priority === 'HIGH',
    JSON.stringify(res.body.taskNote)
  );
  res = await put(reminderId, { priority: 'someday' });
  check(
    'PUT with an unknown priority -> 400',
    res.status === 400 && /Priority must be one of/.test(res.body.message || ''),
    `status=${res.status}`
  );
  res = await put(reminderId, { assignedTo: otherMember._id.toString() });
  check(
    'PUT with a foreign member -> 400',
    res.status === 400 && /Assigned member not found/.test(res.body.message || ''),
    `status=${res.status}`
  );
  res = await put(reminderId, { reminderAt: 'tomorrow-ish' });
  check(
    'PUT with an unparseable reminder -> 400',
    res.status === 400 && /valid date and time/.test(res.body.message || ''),
    `status=${res.status}`
  );
  const unchanged = await TaskNote.findById(reminderId);
  check(
    'rejected PUTs left the document untouched',
    unchanged?.priority === 'HIGH' && unchanged?.assignedTo === null && unchanged?.reminderAt === null,
    JSON.stringify({
      priority: unchanged?.priority,
      assignedTo: unchanged?.assignedTo,
      reminderAt: unchanged?.reminderAt,
    })
  );

  console.log('\n[6] Existing behaviour and the summary metrics are unaffected');
  res = await post({
    description: 'Cash in hand',
    presentAmount: 100,
    category: 'PRESENT_HAVING',
    priority: 'LOW',
  });
  check(
    'category + amount still persist alongside the extras',
    res.status === 201 && res.body.taskNote?.category === 'PRESENT_HAVING',
    JSON.stringify(res.body)
  );

  res = await list();
  const summary = res.body?.summary;
  check(
    'GET still returns a numeric summary',
    res.status === 200 &&
      !!summary &&
      typeof summary.totalPresentHaving === 'number' &&
      typeof summary.totalExpense === 'number',
    JSON.stringify(summary)
  );
  const fetched = res.body.taskNotes.find((note) => note.description === 'Assign to Ravi');
  check(
    'GET returns the new fields per task',
    fetched?.priority === 'MEDIUM' && String(fetched?.assignedTo) === member._id.toString(),
    JSON.stringify({ priority: fetched?.priority, assignedTo: fetched?.assignedTo })
  );

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  return failures;
};

run()
  .then(async (failuresCount) => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
    process.exit(failuresCount === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('Test run crashed:', err);
    try {
      await mongoose.disconnect();
      if (mongod) await mongod.stop();
    } catch {
      // The process is already exiting — the cleanup failure is not actionable.
    }
    process.exit(1);
  });
