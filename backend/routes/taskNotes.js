const express = require('express');
const {
  getTaskNotes,
  createTaskNote,
  updateTaskNote,
  deleteTaskNote,
} = require('../controllers/taskNoteController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.route('/').get(getTaskNotes).post(createTaskNote);
router.route('/:id').put(updateTaskNote).delete(deleteTaskNote);

module.exports = router;
