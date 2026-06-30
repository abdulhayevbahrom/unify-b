import { Group } from '../models/group.model.js';
import { Student } from '../models/student.model.js';

async function buildStudentFilter(query, user) {
  const conditions = [];

  if (user?.role === 'teacher' && user.teacherId) {
    const teacherGroupIds = await Group.find({ teacherId: user.teacherId }).distinct('_id');
    conditions.push({ $or: [{ groupId: { $in: teacherGroupIds } }, { 'enrollments.groupId': { $in: teacherGroupIds } }] });
  }

  if (query.search) {
    const matchingGroupIds = await Group.find({
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { subject: { $regex: query.search, $options: 'i' } },
      ],
    }).distinct('_id');

    conditions.push({
      $or: [
        { fullName: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
        { secondaryPhone: { $regex: query.search, $options: 'i' } },
        { parentName: { $regex: query.search, $options: 'i' } },
        { parentPhone: { $regex: query.search, $options: 'i' } },
        { 'enrollmentHistory.groupName': { $regex: query.search, $options: 'i' } },
        { 'enrollmentHistory.subject': { $regex: query.search, $options: 'i' } },
        { groupId: { $in: matchingGroupIds } },
        { 'enrollments.groupId': { $in: matchingGroupIds } },
      ],
    });
  }

  if (query.groupId) {
    conditions.push({ $or: [{ groupId: query.groupId }, { 'enrollments.groupId': query.groupId }] });
  }

  if (query.status) {
    conditions.push({ status: query.status });
  }

  if (query.paymentStatus) {
    conditions.push({ paymentStatus: query.paymentStatus });
  }

  if (query.view === 'current' || query.view === 'history') {
    const archivedGroupIds = await Group.find({ status: 'archived' }).distinct('_id');

    if (query.view === 'current') {
      conditions.push({ status: { $in: ['active', 'paused'] } });
      conditions.push({ groupId: { $nin: archivedGroupIds } });
    } else {
      conditions.push({
        $or: [{ status: { $in: ['left', 'inactive'] } }, { groupId: { $in: archivedGroupIds } }],
      });
    }
  }

  return conditions.length ? { $and: conditions } : {};
}

function getPagination(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function normalizeStudentPayload(body) {
  return {
    ...body,
    fullName: body.fullName?.trim(),
    phone: body.phone?.trim(),
    secondaryPhone: body.secondaryPhone?.trim() || '',
    parentName: body.parentName?.trim() || '',
    parentPhone: body.parentPhone?.trim() || '',
    status: body.status || 'active',
    paymentStatus: body.paymentStatus || 'debt',
    allowClosedGroup: Boolean(body.allowClosedGroup),
    note: body.note?.trim() || '',
  };
}

function validateRequiredStudentFields(payload) {
  if (!payload.fullName) return "O'quvchi F.I.Sh kiritilishi kerak";
  if (!payload.phone) return 'Telefon raqam kiritilishi kerak';
  if (payload.secondaryPhone && payload.secondaryPhone === payload.phone) {
    return 'Ikkinchi telefon asosiy telefon bilan bir xil bo‘lmasligi kerak';
  }
  if (!payload.groupId) return 'Guruh tanlanishi kerak';

  return null;
}

function toTeacherResponse(teacher) {
  if (!teacher) return null;

  return {
    id: teacher._id.toString(),
    fullName: teacher.fullName,
    subject: teacher.subject,
    phone: teacher.phone,
    gender: teacher.gender,
    experienceYears: teacher.experienceYears,
    status: teacher.status,
    note: teacher.note,
    groupsCount: 0,
    createdAt: teacher.createdAt,
    updatedAt: teacher.updatedAt,
  };
}

function toGroupResponse(group) {
  if (!group) return null;

  return {
    id: group._id.toString(),
    name: group.name,
    subject: group.subject,
    teacherId: group.teacherId?._id?.toString() || group.teacherId?.toString(),
    teacher: toTeacherResponse(group.teacherId),
    room: group.room,
    lessonDays: group.lessonDays,
    startTime: group.startTime,
    endTime: group.endTime,
    startDate: group.startDate || group.createdAt,
    monthlyPrice: group.monthlyPrice,
    priceHistory: group.priceHistory || [],
    isEnrollmentOpen: group.isEnrollmentOpen !== false,
    endedAt: group.endedAt || null,
    note: group.note,
    studentsCount: 0,
    status: group.status,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

function toStudentResponse(student) {
  const data = student.toObject({ virtuals: true });
  const group = data.groupId && typeof data.groupId === 'object' ? toGroupResponse(data.groupId) : null;
  const isArchivedGroup = group?.status === 'archived';
  const fallbackEndedAt = data.leftAt || group?.endedAt || null;
  const enrollmentHistory = data.enrollmentHistory?.length
    ? data.enrollmentHistory.map((item) => ({
        groupId: item.groupId?.toString(),
        groupName: item.groupName,
        subject: item.subject,
        startedAt: item.startedAt,
        endedAt: item.endedAt || fallbackEndedAt,
        endReason: item.endReason || (isArchivedGroup ? 'Guruh arxivlandi' : ''),
      }))
    : group
      ? [
          {
            groupId: group.id,
            groupName: group.name,
            subject: group.subject,
            startedAt: data.createdAt,
            endedAt: fallbackEndedAt,
            endReason: isArchivedGroup ? 'Guruh arxivlandi' : '',
          },
        ]
      : [];
  const enrollments = (data.enrollments || []).map((item) => {
    const enrollmentGroup = item.groupId && typeof item.groupId === 'object' ? toGroupResponse(item.groupId) : null;
    return {
      id: item._id?.toString(),
      groupId: enrollmentGroup?.id || item.groupId?.toString(),
      group: enrollmentGroup,
      startedAt: item.startedAt,
      endedAt: item.endedAt || null,
      status: item.status,
      discountType: item.discountType || 'none',
      discountValue: item.discountValue || 0,
      discountReason: item.discountReason || '',
    };
  });

  return {
    ...data,
    id: data._id.toString(),
    group,
    groupId: group?.id || data.groupId?.toString(),
    teacher: group?.teacher || null,
    status: isArchivedGroup ? 'left' : data.status,
    leftAt: fallbackEndedAt,
    enrollmentHistory,
    enrollments,
    _id: undefined,
    __v: undefined,
  };
}

async function validateGroup(groupId) {
  if (!groupId) {
    return null;
  }

  return Group.findById(groupId);
}

async function findDuplicateStudent(payload, ignoredStudentId) {
  const duplicateChecks = [{ phone: payload.phone }];

  if (payload.secondaryPhone) {
    duplicateChecks.push({ phone: payload.secondaryPhone }, { secondaryPhone: payload.secondaryPhone });
  }

  duplicateChecks.push({ secondaryPhone: payload.phone });

  const filter = { $or: duplicateChecks };

  if (ignoredStudentId) {
    filter._id = { $ne: ignoredStudentId };
  }

  return Student.findOne(filter);
}

function getDuplicateMessage(duplicate, payload) {
  if (duplicate.phone === payload.phone) {
    return "Bu telefon raqam bilan o'quvchi allaqachon mavjud";
  }

  if (payload.secondaryPhone && (duplicate.phone === payload.secondaryPhone || duplicate.secondaryPhone === payload.secondaryPhone)) {
    return "Bu ikkinchi telefon raqam bilan o'quvchi allaqachon mavjud";
  }

  if (duplicate.secondaryPhone === payload.phone) {
    return "Bu telefon raqam boshqa o'quvchining ikkinchi telefoni sifatida mavjud";
  }

  return "O'quvchi ma'lumotlari takrorlanmoqda";
}

export async function getStudents(req, res) {
  try {
    const filter = await buildStudentFilter(req.query, req.user);
    const { page, limit, skip } = getPagination(req.query);
    const [students, total] = await Promise.all([
      Student.find(filter)
        .populate({ path: 'groupId', populate: { path: 'teacherId' } })
        .populate({ path: 'enrollments.groupId', populate: { path: 'teacherId' } })
        .sort({ createdAt: -1 }).skip(skip).limit(limit),
      Student.countDocuments(filter),
    ]);

    res.json({
      data: students.map(toStudentResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "O'quvchilar ro'yxatini olishda xatolik", error: error.message });
  }
}

export async function getStudentById(req, res) {
  try {
    const student = await Student.findById(req.params.id).populate({
      path: 'groupId',
      populate: { path: 'teacherId' },
    }).populate({ path: 'enrollments.groupId', populate: { path: 'teacherId' } });

    if (!student || (req.user?.role === 'teacher' && student.groupId?.teacherId?._id?.toString() !== req.user.teacherId?.toString())) {
      return res.status(404).json({ message: "O'quvchi topilmadi" });
    }

    return res.json(toStudentResponse(student));
  } catch (error) {
    return res.status(500).json({ message: "O'quvchi ma'lumotini olishda xatolik", error: error.message });
  }
}

export async function createStudent(req, res) {
  try {
    const payload = normalizeStudentPayload(req.body);
    const requiredError = validateRequiredStudentFields(payload);

    if (requiredError) {
      return res.status(400).json({ message: requiredError });
    }

    const group = await validateGroup(payload.groupId);

    if (!group) {
      return res.status(400).json({ message: 'Tanlangan guruh topilmadi' });
    }

    if (group.status !== 'active' || (group.isEnrollmentOpen === false && !payload.allowClosedGroup)) {
      return res.status(400).json({ message: 'Tanlangan guruhga qabul yopiq' });
    }

    const duplicate = await findDuplicateStudent(payload);

    if (duplicate) {
      return res.status(409).json({ message: getDuplicateMessage(duplicate, payload) });
    }

    const student = await Student.create({
      ...payload,
      leftAt: null,
      enrollmentHistory: [
        {
          groupId: group._id,
          groupName: group.name,
          subject: group.subject,
          startedAt: new Date(),
          endedAt: null,
          endReason: '',
        },
      ],
      enrollments: [{
        groupId: group._id,
        startedAt: new Date(),
        status: 'active',
        discountType: payload.discountType || 'none',
        discountValue: Number(payload.discountValue) || 0,
        discountReason: payload.discountReason?.trim() || '',
        discountHistory: payload.discountType && payload.discountType !== 'none' ? [{ type: payload.discountType, value: Number(payload.discountValue) || 0, reason: payload.discountReason?.trim() || '', startedAt: new Date() }] : [],
      }],
    });
    const populatedStudent = await student.populate([
      { path: 'groupId', populate: { path: 'teacherId' } },
      { path: 'enrollments.groupId', populate: { path: 'teacherId' } },
    ]);

    return res.status(201).json(toStudentResponse(populatedStudent));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Telefon ma'lumoti takrorlangan" });
    }

    return res.status(400).json({ message: "O'quvchi yaratishda xatolik", error: error.message });
  }
}

export async function updateStudent(req, res) {
  try {
    const payload = normalizeStudentPayload(req.body);
    const requiredError = validateRequiredStudentFields(payload);

    if (requiredError) {
      return res.status(400).json({ message: requiredError });
    }

    const group = await validateGroup(payload.groupId);

    if (!group) {
      return res.status(400).json({ message: 'Tanlangan guruh topilmadi' });
    }

    if (group.status !== 'active' || (group.isEnrollmentOpen === false && !payload.allowClosedGroup)) {
      return res.status(400).json({ message: 'Tanlangan guruhga qabul yopiq' });
    }

    const duplicate = await findDuplicateStudent(payload, req.params.id);

    if (duplicate) {
      return res.status(409).json({ message: getDuplicateMessage(duplicate, payload) });
    }

    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ message: "O'quvchi topilmadi" });
    }

    const groupChanged = student.groupId.toString() !== payload.groupId;

    if (groupChanged) {
      const now = new Date();
      const activeEnrollment = student.enrollmentHistory.find((item) => !item.endedAt);

      if (activeEnrollment) {
        activeEnrollment.endedAt = now;
        activeEnrollment.endReason = 'Boshqa guruhga ko‘chirildi';
      } else if (!student.enrollmentHistory.length) {
        const previousGroup = await Group.findById(student.groupId);

        if (previousGroup) {
          student.enrollmentHistory.push({
            groupId: previousGroup._id,
            groupName: previousGroup.name,
            subject: previousGroup.subject,
            startedAt: student.createdAt,
            endedAt: now,
            endReason: 'Boshqa guruhga ko‘chirildi',
          });
        }
      }

      student.enrollmentHistory.push({
        groupId: group._id,
        groupName: group.name,
        subject: group.subject,
        startedAt: now,
        endedAt: null,
        endReason: '',
      });
      const previousEnrollment = student.enrollments.find((item) => item.status === 'active' && item.groupId.toString() === student.groupId.toString());
      if (previousEnrollment) {
        previousEnrollment.status = 'finished';
        previousEnrollment.endedAt = now;
      }
      student.enrollments.push({ groupId: group._id, startedAt: now, status: 'active' });
    }

    student.set({
      ...payload,
      leftAt: payload.status === 'left' ? student.leftAt || new Date() : null,
    });
    const savedStudent = await student.save();
    const populatedStudent = await savedStudent.populate([
      { path: 'groupId', populate: { path: 'teacherId' } },
      { path: 'enrollments.groupId', populate: { path: 'teacherId' } },
    ]);

    return res.json(toStudentResponse(populatedStudent));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Telefon ma'lumoti takrorlangan" });
    }

    return res.status(400).json({ message: "O'quvchi ma'lumotini yangilashda xatolik", error: error.message });
  }
}

export async function addStudentEnrollment(req, res) {
  try {
    const student = await Student.findById(req.params.id);
    const group = await Group.findById(req.body.groupId);
    if (!student || !group) return res.status(404).json({ message: "O'quvchi yoki guruh topilmadi" });
    if (group.status !== 'active' || group.isEnrollmentOpen === false) {
      return res.status(400).json({ message: 'Tanlangan guruhga qabul yopiq' });
    }
    const duplicate = student.enrollments.some((item) => item.status === 'active' && item.groupId.toString() === group.id);
    if (duplicate || student.groupId?.toString() === group.id && !student.enrollments.length) {
      return res.status(409).json({ message: "O'quvchi bu guruhga allaqachon yozilgan" });
    }
    student.enrollments.push({
      groupId: group._id,
      startedAt: req.body.startedAt || new Date(),
      status: 'active',
      discountType: req.body.discountType || 'none',
      discountValue: Number(req.body.discountValue) || 0,
      discountReason: req.body.discountReason?.trim() || '',
      discountHistory: req.body.discountType && req.body.discountType !== 'none' ? [{ type: req.body.discountType, value: Number(req.body.discountValue) || 0, reason: req.body.discountReason?.trim() || '', startedAt: new Date() }] : [],
    });
    await student.save();
    const populated = await student.populate([
      { path: 'groupId', populate: { path: 'teacherId' } },
      { path: 'enrollments.groupId', populate: { path: 'teacherId' } },
    ]);
    return res.status(201).json(toStudentResponse(populated));
  } catch (error) {
    return res.status(400).json({ message: 'Kursga yozib bo‘lmadi', error: error.message });
  }
}

export async function updateStudentEnrollment(req, res) {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "O'quvchi topilmadi" });
    const enrollment = student.enrollments.id(req.params.enrollmentId);
    if (!enrollment) return res.status(404).json({ message: 'Kurs yozuvi topilmadi' });
    if (req.body.status === 'finished') {
      enrollment.status = 'finished';
      enrollment.endedAt = req.body.endedAt || new Date();
    }
    if (['none', 'percentage', 'fixed'].includes(req.body.discountType)) {
      const now = new Date();
      const activeDiscount = enrollment.discountHistory.find((item) => !item.endedAt);
      if (activeDiscount) activeDiscount.endedAt = now;
      enrollment.discountType = req.body.discountType;
      enrollment.discountValue = Math.max(Number(req.body.discountValue) || 0, 0);
      enrollment.discountReason = req.body.discountReason?.trim() || '';
      if (req.body.discountType !== 'none') enrollment.discountHistory.push({ type: req.body.discountType, value: enrollment.discountValue, reason: enrollment.discountReason, startedAt: now });
    }
    await student.save();
    return res.json({ message: 'Kurs ma’lumoti yangilandi' });
  } catch (error) {
    return res.status(400).json({ message: 'Kurs ma’lumotini yangilab bo‘lmadi', error: error.message });
  }
}

export async function deleteStudent(req, res) {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);

    if (!student) {
      return res.status(404).json({ message: "O'quvchi topilmadi" });
    }

    return res.json({ message: "O'quvchi o'chirildi", id: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: "O'quvchini o'chirishda xatolik", error: error.message });
  }
}
