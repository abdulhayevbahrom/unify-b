import { Router } from 'express';
import {
  createTeacher,
  deleteTeacher,
  getTeacherById,
  getTeachers,
  updateTeacher,
} from '../controllers/teachers.controller.js';

const router = Router();

router.get('/', getTeachers);
router.post('/', createTeacher);
router.get('/:id', getTeacherById);
router.put('/:id', updateTeacher);
router.delete('/:id', deleteTeacher);

export default router;
