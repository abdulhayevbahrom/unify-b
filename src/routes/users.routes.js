import { Router } from 'express';
import {
  createEmployeeSalaryTransaction,
  createUser,
  deleteUser,
  getEmployeeSalaries,
  getUsers,
  updateUser,
} from '../controllers/users.controller.js';

const router = Router();

router.get('/salaries', getEmployeeSalaries);
router.post('/salaries/transactions', createEmployeeSalaryTransaction);
router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
