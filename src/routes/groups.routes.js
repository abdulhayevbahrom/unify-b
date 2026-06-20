import { Router } from 'express';
import { createGroup, deleteGroup, getGroupById, getGroups, updateGroup } from '../controllers/groups.controller.js';

const router = Router();

router.get('/', getGroups);
router.post('/', createGroup);
router.get('/:id', getGroupById);
router.put('/:id', updateGroup);
router.delete('/:id', deleteGroup);

export default router;
