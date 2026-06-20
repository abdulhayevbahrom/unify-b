import { Router } from 'express';
import {
  createPayment,
  createStudentPause,
  activatePausedStudent,
  closeCashRegister,
  getStudentFinance,
  getDebtors,
  getPaymentsDashboard,
  reviewCashClosure,
  updateStudentPause,
  reversePayment,
  updatePayment,
  getPaymentsHistory,
} from '../controllers/finance.controller.js';

const router = Router();

router.get('/payments-dashboard', getPaymentsDashboard);
router.get('/payments', getPaymentsHistory);
router.get('/debtors', getDebtors);
router.post('/cash-closures', closeCashRegister);
router.put('/cash-closures/:closureId/review', reviewCashClosure);
router.get('/students/:studentId', getStudentFinance);
router.post('/students/:studentId/payments', createPayment);
router.put('/payments/:paymentId/reverse', reversePayment);
router.put('/payments/:paymentId', updatePayment);
router.post('/students/:studentId/pauses', createStudentPause);
router.post('/students/:studentId/activate', activatePausedStudent);
router.put('/students/:studentId/pauses/:pauseId', updateStudentPause);

export default router;
