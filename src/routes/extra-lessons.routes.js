import { Router } from 'express';
import { createExtraLesson, createExtraLessonPayment, getExtraLessons, updateExtraLesson } from '../controllers/extra-lessons.controller.js';

const router = Router();

router.get('/', getExtraLessons);
router.post('/', createExtraLesson);
router.put('/:id', updateExtraLesson);
router.post('/:id/payments', createExtraLessonPayment);

export default router;
