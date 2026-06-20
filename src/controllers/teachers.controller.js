import { Teacher } from '../models/teacher.model.js';
import { Group } from '../models/group.model.js';

function buildTeacherFilter(query) {
  const filter = {};

  if (query.search) {
    filter.$or = [
      { fullName: { $regex: query.search, $options: 'i' } },
      { phone: { $regex: query.search, $options: 'i' } },
      { telegram: { $regex: query.search, $options: 'i' } },
    ];
  }

  if (query.subject) {
    filter.subject = query.subject;
  }

  if (query.status) {
    filter.status = query.status;
  }

  return filter;
}

function normalizeTeacherPayload(body) {
  return {
    ...body,
    fullName: body.fullName?.trim(),
    subject: body.subject?.trim(),
    phone: body.phone?.trim(),
    telegram: body.telegram?.trim() || '',
    monthlySalary: Number(body.monthlySalary) || 0,
    salaryType: body.salaryType === 'percentage' ? 'percentage' : 'fixed',
    salaryPercentage: Number(body.salaryPercentage) || 0,
    note: body.note?.trim() || '',
  };
}

function getPagination(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

async function findDuplicateTeacher(payload, ignoredTeacherId) {
  const duplicateChecks = [{ phone: payload.phone }];

  if (payload.telegram) {
    duplicateChecks.push({ telegram: payload.telegram });
  }

  const filter = { $or: duplicateChecks };

  if (ignoredTeacherId) {
    filter._id = { $ne: ignoredTeacherId };
  }

  return Teacher.findOne(filter);
}

function getDuplicateMessage(duplicate, payload) {
  if (duplicate.phone === payload.phone) {
    return 'Bu telefon raqam bilan o\'qituvchi allaqachon mavjud';
  }

  if (payload.telegram && duplicate.telegram === payload.telegram) {
    return 'Bu Telegram username bilan o\'qituvchi allaqachon mavjud';
  }

  return "O'qituvchi ma'lumotlari takrorlanmoqda";
}

function toTeacherResponse(teacher, groupsCount = 0) {
  const data = teacher.toJSON();
  return {
    ...data,
    groupsCount,
  };
}

export async function getTeachers(req, res) {
  try {
    const filter = buildTeacherFilter(req.query);
    const { page, limit, skip } = getPagination(req.query);
    const [teachers, total] = await Promise.all([
      Teacher.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Teacher.countDocuments(filter),
    ]);
    const groupCounts = await Group.aggregate([
      { $match: { teacherId: { $in: teachers.map((teacher) => teacher._id) } } },
      { $group: { _id: '$teacherId', count: { $sum: 1 } } },
    ]);
    const groupCountMap = new Map(groupCounts.map((item) => [item._id.toString(), item.count]));

    res.json({
      data: teachers.map((teacher) => toTeacherResponse(teacher, groupCountMap.get(teacher._id.toString()) || 0)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "O'qituvchilar ro'yxatini olishda xatolik", error: error.message });
  }
}

export async function getTeacherById(req, res) {
  try {
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) {
      return res.status(404).json({ message: "O'qituvchi topilmadi" });
    }

    const groupsCount = await Group.countDocuments({ teacherId: teacher._id });

    return res.json(toTeacherResponse(teacher, groupsCount));
  } catch (error) {
    return res.status(500).json({ message: "O'qituvchi ma'lumotini olishda xatolik", error: error.message });
  }
}

export async function createTeacher(req, res) {
  try {
    const payload = normalizeTeacherPayload(req.body);
    const duplicate = await findDuplicateTeacher(payload);

    if (duplicate) {
      return res.status(409).json({ message: getDuplicateMessage(duplicate, payload) });
    }

    const teacher = await Teacher.create(payload);
    res.status(201).json(toTeacherResponse(teacher));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Telefon yoki Telegram ma'lumoti takrorlangan" });
    }

    res.status(400).json({ message: "O'qituvchi yaratishda xatolik", error: error.message });
  }
}

export async function updateTeacher(req, res) {
  try {
    const payload = normalizeTeacherPayload(req.body);
    const duplicate = await findDuplicateTeacher(payload, req.params.id);

    if (duplicate) {
      return res.status(409).json({ message: getDuplicateMessage(duplicate, payload) });
    }

    const teacher = await Teacher.findByIdAndUpdate(req.params.id, payload, {
      returnDocument: 'after',
      runValidators: true,
    });

    if (!teacher) {
      return res.status(404).json({ message: "O'qituvchi topilmadi" });
    }

    return res.json(toTeacherResponse(teacher));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Telefon yoki Telegram ma'lumoti takrorlangan" });
    }

    return res.status(400).json({ message: "O'qituvchi ma'lumotini yangilashda xatolik", error: error.message });
  }
}

export async function deleteTeacher(req, res) {
  try {
    const teacher = await Teacher.findByIdAndDelete(req.params.id);

    if (!teacher) {
      return res.status(404).json({ message: "O'qituvchi topilmadi" });
    }

    return res.json({ message: "O'qituvchi o'chirildi", id: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: "O'qituvchini o'chirishda xatolik", error: error.message });
  }
}
