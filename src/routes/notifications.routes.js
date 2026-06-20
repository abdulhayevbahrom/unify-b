import { Router } from 'express';
import { getNotifications, markNotificationRead } from '../controllers/notifications.controller.js';

const router = Router();

router.get('/', getNotifications);
router.put('/:notificationId/read', markNotificationRead);

export default router;
