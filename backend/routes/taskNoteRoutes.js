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
router.get('/', getTaskNotes);
router.post('/', createTaskNote);
router.put('/:id', updateTaskNote);
router.delete('/:id', deleteTaskNote);

module.exports = router;
