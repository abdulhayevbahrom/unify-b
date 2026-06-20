import { PERMISSIONS } from '../config/permissions.js';
import { User } from '../models/user.model.js';
import { createToken, hashPassword, verifyPassword } from '../utils/auth.js';
import { Notification } from '../models/notification.model.js';
import { clearLoginFailures, getLoginBlock, registerLoginFailure } from '../services/login-protection.service.js';
import { emitToRole } from '../socket.js';

function normalizeUsername(value) {
  return value?.trim().toLowerCase();
}

function publicUser(user) {
  const data = user.toJSON();
  return {
    ...data,
    permissions: user.role === 'owner' ? PERMISSIONS : data.permissions,
  };
}

function validateCredentials(body) {
  if (!body.fullName?.trim() || body.fullName.trim().length < 3) {
    return 'F.I.Sh kamida 3 ta belgidan iborat bo‘lishi kerak';
  }

  if (!/^[a-z0-9._-]{3,60}$/.test(normalizeUsername(body.username) || '')) {
    return 'Login kamida 3 ta belgidan iborat bo‘lib, lotin harflari va raqamlardan tuzilishi kerak';
  }

  if (!body.password || body.password.length < 6) {
    return 'Parol kamida 6 ta belgidan iborat bo‘lishi kerak';
  }

  return null;
}

export async function getAuthStatus(_req, res) {
  const usersCount = await User.countDocuments();
  return res.json({ setupRequired: usersCount === 0 });
}

export async function setupOwner(req, res) {
  try {
    if (await User.exists({})) {
      return res.status(409).json({ message: 'Owner avval yaratilgan' });
    }

    const validationError = validateCredentials(req.body);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const user = await User.create({
      fullName: req.body.fullName.trim(),
      username: normalizeUsername(req.body.username),
      passwordHash: await hashPassword(req.body.password),
      role: 'owner',
      permissions: PERMISSIONS,
      status: 'active',
    });

    return res.status(201).json({ token: createToken(user.id), user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Bu login band' });
    }

    return res.status(400).json({ message: 'Owner yaratib bo‘lmadi', error: error.message });
  }
}

export async function login(req, res) {
  try {
    const username = normalizeUsername(req.body.username);
    const block = getLoginBlock(req.ip, username);
    if (block) {
      res.setHeader('Retry-After', block.retryAfterSeconds);
      return res.status(429).json({ message: `Juda ko‘p noto‘g‘ri urinish. ${Math.ceil(block.retryAfterSeconds / 60)} daqiqadan keyin qayta urinib ko‘ring` });
    }
    const user = await User.findOne({ username }).select('+passwordHash');

    if (!user || !(await verifyPassword(req.body.password || '', user.passwordHash))) {
      const failure = registerLoginFailure(req.ip, username);
      if (failure.justBlocked) {
        const notification = await Notification.create({
          role: 'owner', type: 'system', title: 'Shubhali login urinishlari',
          message: `${username || 'Noma’lum login'} uchun ${req.ip} manzildan ko‘p noto‘g‘ri urinish bo‘ldi. Kirish 15 daqiqaga bloklandi.`,
        });
        emitToRole('owner', 'notification:new', { notification: notification.toJSON() });
      }
      return res.status(401).json({ message: 'Login yoki parol noto‘g‘ri' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Hodim hisobi faol emas' });
    }

    user.lastLoginAt = new Date();
    await user.save();
    clearLoginFailures(req.ip, username);

    return res.json({ token: createToken(user.id), user: publicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Tizimga kirishda xatolik', error: error.message });
  }
}

export function getMe(req, res) {
  return res.json(publicUser(req.user));
}
