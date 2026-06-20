import { Router } from 'express';
import {
  createStudent,
  deleteStudent,
  getStudentById,
  getStudents,
  updateStudent,
  addStudentEnrollment,
  updateStudentEnrollment,
} from '../controllers/students.controller.js';

const router = Router();

router.get('/', getStudents);
router.post('/', createStudent);
router.get('/:id', getStudentById);
router.put('/:id', updateStudent);
router.post('/:id/enrollments', addStudentEnrollment);
router.put('/:id/enrollments/:enrollmentId', updateStudentEnrollment);
router.delete('/:id', deleteStudent);

export default router;
