import { PERMISSIONS } from '../config/permissions.js';
import { User } from '../models/user.model.js';
import { verifyToken } from '../utils/auth.js';

export async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

    if (!token) {
      return res.status(401).json({ message: 'Tizimga kirish talab qilinadi' });
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);

    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Sessiya faol emas' });
    }

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Sessiya yaroqsiz yoki muddati tugagan' });
  }
}

export function requireAnyPermission(...permissions) {
  const validPermissions = permissions.filter((permission) => PERMISSIONS.includes(permission));

  return (req, res, next) => {
    if (req.user?.role === 'owner' || validPermissions.some((permission) => req.user?.permissions.includes(permission))) {
      return next();
    }

    return res.status(403).json({ message: 'Bu bo‘lim uchun ruxsat berilmagan' });
  };
}

export function requireOwner(req, res, next) {
  if (req.user?.role === 'owner') return next();
  return res.status(403).json({ message: 'Bu amal faqat owner uchun mavjud' });
}
