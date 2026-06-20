import { PERMISSIONS } from '../config/permissions.js';
import { Teacher } from '../models/teacher.model.js';
import { User } from '../models/user.model.js';
import { createSalaryTransaction, getSalaryDashboard } from '../services/salary.service.js';
import { hashPassword } from '../utils/auth.js';

function normalizePayload(body, includePassword = true) {
  const payload = {
    fullName: body.fullName?.trim(),
    username: body.username?.trim().toLowerCase(),
    role: ['owner', 'teacher'].includes(body.role) ? body.role : 'employee',
    teacherId: body.role === 'teacher' && body.teacherId ? body.teacherId : null,
    permissions: [...new Set((body.permissions || []).filter((permission) => PERMISSIONS.includes(permission)))],
    monthlySalary: body.role === 'teacher' ? 0 : Number(body.monthlySalary) || 0,
    status: body.status === 'inactive' ? 'inactive' : 'active',
  };

  if (payload.role === 'owner') {
    payload.permissions = PERMISSIONS;
  }

  if (includePassword && body.password) {
    payload.password = body.password;
  }

  return payload;
}

function validatePayload(payload, passwordRequired = false) {
  if (!payload.fullName || payload.fullName.length < 3) {
    return 'F.I.Sh kamida 3 ta belgidan iborat bo‘lishi kerak';
  }

  if (!/^[a-z0-9._-]{3,60}$/.test(payload.username || '')) {
    return 'Login formati noto‘g‘ri';
  }

  if (passwordRequired && (!payload.password || payload.password.length < 6)) {
    return 'Parol kamida 6 ta belgidan iborat bo‘lishi kerak';
  }

  if (payload.password && payload.password.length < 6) {
    return 'Yangi parol kamida 6 ta belgidan iborat bo‘lishi kerak';
  }

  if (payload.role === 'teacher' && !payload.teacherId) {
    return "O'qituvchi profili tanlanishi kerak";
  }

  return null;
}

function buildUsersFilter(query) {
  const search = query.search?.trim();
  const filter = {};

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { fullName: regex },
      { username: regex },
      { role: regex },
    ];
  }

  return filter;
}

export async function getUsers(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const filter = buildUsersFilter(req.query);
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ role: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return res.json({
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Hodimlarni olishda xatolik', error: error.message });
  }
}

export async function createUser(req, res) {
  try {
    const payload = normalizePayload(req.body);

    if (payload.role === 'owner' && req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Owner yaratish faqat ownerga ruxsat etilgan' });
    }

    const validationError = validatePayload(payload, true);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (payload.role === 'teacher' && !await Teacher.exists({ _id: payload.teacherId })) {
      return res.status(400).json({ message: "Tanlangan o'qituvchi topilmadi" });
    }

    const user = await User.create({
      ...payload,
      passwordHash: await hashPassword(payload.password),
    });

    return res.status(201).json(user);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Bu login band' });
    }

    return res.status(400).json({ message: 'Hodim qo‘shishda xatolik', error: error.message });
  }
}

export async function updateUser(req, res) {
  try {
    const targetUser = await User.findById(req.params.id).select('+passwordHash');

    if (!targetUser) {
      return res.status(404).json({ message: 'Hodim topilmadi' });
    }

    const payload = normalizePayload(req.body);

    if (req.user.role !== 'owner' && (targetUser.role === 'owner' || payload.role === 'owner')) {
      return res.status(403).json({ message: 'Owner ma’lumotini faqat owner o‘zgartira oladi' });
    }

    const validationError = validatePayload(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (payload.role === 'teacher' && !await Teacher.exists({ _id: payload.teacherId })) {
      return res.status(400).json({ message: "Tanlangan o'qituvchi topilmadi" });
    }

    if (targetUser.role === 'owner' && payload.role !== 'owner' && await User.countDocuments({ role: 'owner' }) <= 1) {
      return res.status(400).json({ message: 'Oxirgi owner rolini o‘zgartirib bo‘lmaydi' });
    }

    Object.assign(targetUser, payload);

    if (payload.password) {
      targetUser.passwordHash = await hashPassword(payload.password);
    }

    await targetUser.save();
    return res.json(targetUser);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Bu login band' });
    }

    return res.status(400).json({ message: 'Hodimni yangilashda xatolik', error: error.message });
  }
}

export async function deleteUser(req, res) {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'O‘zingizni o‘chira olmaysiz' });
    }

    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ message: 'Hodim topilmadi' });
    }

    if (targetUser.role === 'owner' && req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Ownerni faqat owner o‘chira oladi' });
    }

    if (targetUser.role === 'owner' && await User.countDocuments({ role: 'owner' }) <= 1) {
      return res.status(400).json({ message: 'Oxirgi ownerni o‘chirib bo‘lmaydi' });
    }

    await targetUser.deleteOne();
    return res.json({ message: 'Hodim o‘chirildi', id: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: 'Hodimni o‘chirishda xatolik', error: error.message });
  }
}

export async function getEmployeeSalaries(req, res) {
  try {
    return res.json(await getSalaryDashboard(req.query.month, req.query.search));
  } catch (error) {
    return res.status(500).json({ message: 'Hodimlar oyligini olishda xatolik', error: error.message });
  }
}

export async function createEmployeeSalaryTransaction(req, res) {
  try {
    const result = await createSalaryTransaction({
      ...req.body,
      amount: Number(req.body.amount) || 0,
      createdBy: req.user._id,
    });

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.status(201).json(result.transaction);
  } catch (error) {
    return res.status(400).json({ message: 'Oylik amalini saqlashda xatolik', error: error.message });
  }
}
