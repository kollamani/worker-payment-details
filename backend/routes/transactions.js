const express = require('express');
const router = express.Router();
const {
  getTransactions,
  getDepositBalances,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  deleteAllUserTransactions,
  deleteTransactionsByDateRange,
  getLedgerGrid,
} = require('../controllers/transactionController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/ledger/grid', getLedgerGrid);
router.get('/deposits/:memberId', getDepositBalances);
router.get('/deposit-balances', getDepositBalances);
router.delete('/delete-range', deleteTransactionsByDateRange);
router.delete('/delete-by-range', deleteTransactionsByDateRange);
router.delete('/filtered-delete', deleteTransactionsByDateRange);
router.post('/filter-delete', deleteTransactionsByDateRange);
router.delete('/user/:userId/all', deleteAllUserTransactions);
router.route('/').get(getTransactions).post(createTransaction);
router.route('/:id').put(updateTransaction).delete(deleteTransaction);

module.exports = router;
