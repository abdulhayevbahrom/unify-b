import express, { Router } from 'express';
import {
  getBrandingSettings,
  updateBrandingSettings,
  uploadBrandLogo,
} from '../controllers/settings.controller.js';
import { authenticate, requireOwner } from '../middleware/auth.js';

const router = Router();

router.get('/branding', getBrandingSettings);
router.put('/branding', authenticate, requireOwner, updateBrandingSettings);
router.put(
  '/branding/:brand/logo',
  authenticate,
  requireOwner,
  express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }),
  uploadBrandLogo,
);

export default router;
