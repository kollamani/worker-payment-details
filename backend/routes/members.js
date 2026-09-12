const express = require('express');
const router = express.Router();
const {
  getMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  getMemberSummary,
} = require('../controllers/memberController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/').get(getMembers).post(createMember);
router.route('/:id').get(getMember).put(updateMember).delete(deleteMember);
router.get('/:id/summary', getMemberSummary);

module.exports = router;
