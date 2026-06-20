import { Router } from 'express';
import { getAuthStatus, getMe, login, setupOwner } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/status', getAuthStatus);
router.post('/setup', setupOwner);
router.post('/login', login);
router.get('/me', authenticate, getMe);

export default router;
