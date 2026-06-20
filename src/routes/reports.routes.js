import { Router } from 'express';
import { exportFinancialReport, getFinancialReport } from '../controllers/reports.controller.js';

const router = Router();
router.get('/finance', getFinancialReport);
router.get('/finance/export', exportFinancialReport);
export default router;
