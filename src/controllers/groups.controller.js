import { Group } from '../models/group.model.js';
import { Student } from '../models/student.model.js';
import { Teacher } from '../models/teacher.model.js';
import { rebuildStudentBalances } from './finance.controller.js';

function buildGroupFilter(query) {
  const filter = {};

  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { subject: { $regex: query.search, $options: 'i' } },
      { room: { $regex: query.search, $options: 'i' } },
    ];
  }

  if (query.subject) {
    filter.subject = query.subject;
  }

  if (query.status) {
    filter.status = query.status;
  } else {
    filter.status = { $ne: 'archived' };
  }

  if (query.teacherId) {
    filter.teacherId = query.teacherId;
  }

  if (query.isEnrollmentOpen === 'true') {
    filter.isEnrollmentOpen = { $ne: false };
  }

  if (query.isEnrollmentOpen === 'false') {
    filter.isEnrollmentOpen = false;
  }

  return filter;
}

function getPagination(query) {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

function normalizeGroupPayload(body) {
  const startDate = body.startDate ? new Date(body.startDate) : null;

  return {
    ...body,
    name: body.name?.trim(),
    subject: body.subject?.trim(),
    room: body.room?.trim() || '',
    lessonDays: Array.isArray(body.lessonDays) ? body.lessonDays : [],
    startTime: body.startTime?.trim() || '',
    endTime: body.endTime?.trim() || '',
    startDate,
    status: body.status || 'active',
    isEnrollmentOpen: body.isEnrollmentOpen ?? true,
    note: body.note?.trim() || '',
  };
}

function validateRequiredGroupFields(payload) {
  if (!payload.name) return 'Guruh nomi kiritilishi kerak';
  if (!payload.subject) return 'Fan tanlanishi kerak';
  if (!payload.teacherId) return "O'qituvchi tanlanishi kerak";
  if (!payload.room) return 'Xona kiritilishi kerak';
  if (!payload.lessonDays.length) return 'Kamida bitta dars kuni tanlanishi kerak';
  if (!payload.startTime) return 'Boshlanish vaqti tanlanishi kerak';
  if (!payload.endTime) return 'Tugash vaqti tanlanishi kerak';
  if (!payload.startDate || Number.isNaN(payload.startDate.getTime())) return 'Dars boshlanish sanasi tanlanishi kerak';
  if (timeToMinutes(payload.startTime) >= timeToMinutes(payload.endTime)) {
    return "Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak";
  }
  return null;
}

function toGroupResponse(group, studentsCount = 0, monthlyTotal = 0) {
  const data = group.toObject({ virtuals: true });
  const teacher =
    data.teacherId && typeof data.teacherId === 'object'
      ? {
          id: data.teacherId._id.toString(),
          fullName: data.teacherId.fullName,
          subject: data.teacherId.subject,
          phone: data.teacherId.phone,
          gender: data.teacherId.gender,
          experienceYears: data.teacherId.experienceYears,
          status: data.teacherId.status,
          note: data.teacherId.note,
          createdAt: data.teacherId.createdAt,
          updatedAt: data.teacherId.updatedAt,
          groupsCount: 0,
        }
      : null;

  return {
    ...data,
    id: data._id.toString(),
    teacher,
    teacherId: teacher?.id || data.teacherId?.toString(),
    isEnrollmentOpen: data.isEnrollmentOpen !== false,
    startDate: data.startDate || data.createdAt,
    endedAt: data.endedAt || null,
    studentsCount,
    monthlyTotal,
    _id: undefined,
    __v: undefined,
  };
}

async function validateTeacher(teacherId) {
  if (!teacherId) {
    return null;
  }

  return Teacher.findById(teacherId);
}

async function findDuplicateGroup(payload, ignoredGroupId) {
  const filter = { name: payload.name };

  if (ignoredGroupId) {
    filter._id = { $ne: ignoredGroupId };
  }

  return Group.findOne(filter);
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function hasTimeOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return timeToMinutes(firstStart) < timeToMinutes(secondEnd) && timeToMinutes(secondStart) < timeToMinutes(firstEnd);
}

async function findRoomScheduleConflict(payload, ignoredGroupId) {
  if (payload.status !== 'active') {
    return null;
  }

  const filter = {
    room: payload.room,
    lessonDays: { $in: payload.lessonDays },
    status: 'active',
  };

  if (ignoredGroupId) {
    filter._id = { $ne: ignoredGroupId };
  }

  const groupsInSameRoom = await Group.find(filter);

  return groupsInSameRoom.find((group) =>
    hasTimeOverlap(payload.startTime, payload.endTime, group.startTime, group.endTime),
  );
}

export async function getGroups(req, res) {
  try {
    const filter = buildGroupFilter(req.query);
    if (req.user?.role === 'teacher' && req.user.teacherId) {
      filter.teacherId = req.user.teacherId;
    }
    const { page, limit, skip } = getPagination(req.query);
    const [groups, total] = await Promise.all([
      Group.find(filter).populate('teacherId').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Group.countDocuments(filter),
    ]);
    const studentCounts = await Student.aggregate([
      { $project: { groupIds: { $setUnion: [["$groupId"], { $map: { input: { $filter: { input: { $ifNull: ['$enrollments', []] }, as: 'item', cond: { $eq: ['$$item.status', 'active'] } } }, as: 'item', in: '$$item.groupId' } }] } } },
      { $unwind: '$groupIds' },
      { $match: { groupIds: { $in: groups.map((group) => group._id) } } },
      { $group: { _id: '$groupIds', count: { $sum: 1 } } },
    ]);
    const studentCountMap = new Map(studentCounts.map((item) => [item._id.toString(), item.count]));

    const enrolledStudents = await Student.find({ 'enrollments.groupId': { $in: groups.map((group) => group._id) } }).select('enrollments');
    const monthlyTotals = new Map(groups.map((group) => [group._id.toString(), 0]));
    enrolledStudents.forEach((student) => {
      student.enrollments.filter((item) => item.status === 'active').forEach((item) => {
        const groupId = item.groupId.toString();
        const group = groups.find((candidate) => candidate._id.toString() === groupId);
        if (group) monthlyTotals.set(groupId, (monthlyTotals.get(groupId) || 0) + (Number(item.monthlyPrice) || Number(group.monthlyPrice) || 0));
      });
    });

    res.json({
      data: groups.map((group) => toGroupResponse(group, studentCountMap.get(group._id.toString()) || 0, monthlyTotals.get(group._id.toString()) || 0)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Guruhlar ro'yxatini olishda xatolik", error: error.message });
  }
}

export async function getGroupById(req, res) {
  try {
    const groupFilter = { _id: req.params.id };

    if (req.user?.role === 'teacher' && req.user.teacherId) {
      groupFilter.teacherId = req.user.teacherId;
    }

    const group = await Group.findOne(groupFilter).populate('teacherId');

    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }

    const [studentsCount, enrolledStudents] = await Promise.all([
      Student.countDocuments({ $or: [{ groupId: group._id }, { enrollments: { $elemMatch: { groupId: group._id, status: 'active' } } }] }),
      Student.find({ enrollments: { $elemMatch: { groupId: group._id, status: 'active' } } }).select('enrollments'),
    ]);
    const monthlyTotal = enrolledStudents.reduce((total, student) => {
      const enrollment = student.enrollments.find((item) => item.status === 'active' && item.groupId.toString() === group.id);
      return total + (Number(enrollment?.monthlyPrice) || Number(group.monthlyPrice) || 0);
    }, 0);

    return res.json(toGroupResponse(group, studentsCount, monthlyTotal));
  } catch (error) {
    return res.status(500).json({ message: "Guruh ma'lumotini olishda xatolik", error: error.message });
  }
}

export async function createGroup(req, res) {
  try {
    const payload = normalizeGroupPayload(req.body);
    const requiredError = validateRequiredGroupFields(payload);

    if (requiredError) {
      return res.status(400).json({ message: requiredError });
    }

    const teacher = await validateTeacher(payload.teacherId);

    if (!teacher) {
      return res.status(400).json({ message: "Tanlangan o'qituvchi topilmadi" });
    }

    if (teacher.subject !== payload.subject) {
      return res.status(400).json({ message: "Tanlangan o'qituvchi shu fanga tegishli emas" });
    }

    const duplicate = await findDuplicateGroup(payload);

    if (duplicate) {
      return res.status(409).json({ message: 'Bu nom bilan guruh allaqachon mavjud' });
    }

    const roomConflict = await findRoomScheduleConflict(payload);

    if (roomConflict) {
      return res.status(409).json({
        message: `${payload.room} xonada shu kun va vaqt oralig'ida "${roomConflict.name}" guruhi bor`,
      });
    }

    const group = await Group.create({
      ...payload,
      isEnrollmentOpen: payload.status === 'active' ? payload.isEnrollmentOpen : false,
      endedAt: payload.status === 'active' ? null : new Date(),
    });
    const populatedGroup = await group.populate('teacherId');

    return res.status(201).json(toGroupResponse(populatedGroup));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Bu nom bilan guruh allaqachon mavjud' });
    }

    return res.status(400).json({ message: 'Guruh yaratishda xatolik', error: error.message });
  }
}

export async function updateGroup(req, res) {
  try {
    const payload = normalizeGroupPayload(req.body);
    const requiredError = validateRequiredGroupFields(payload);

    if (requiredError) {
      return res.status(400).json({ message: requiredError });
    }

    const teacher = await validateTeacher(payload.teacherId);

    if (!teacher) {
      return res.status(400).json({ message: "Tanlangan o'qituvchi topilmadi" });
    }

    if (teacher.subject !== payload.subject) {
      return res.status(400).json({ message: "Tanlangan o'qituvchi shu fanga tegishli emas" });
    }

    const duplicate = await findDuplicateGroup(payload, req.params.id);

    if (duplicate) {
      return res.status(409).json({ message: 'Bu nom bilan guruh allaqachon mavjud' });
    }

    const roomConflict = await findRoomScheduleConflict(payload, req.params.id);

    if (roomConflict) {
      return res.status(409).json({
        message: `${payload.room} xonada shu kun va vaqt oralig'ida "${roomConflict.name}" guruhi bor`,
      });
    }

    const group = await Group.findById(req.params.id);

    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }

    const statusChanged = group.status !== payload.status;
    const nextPayload = {
      ...payload,
      isEnrollmentOpen: payload.status === 'active' ? payload.isEnrollmentOpen : false,
    };

    if (payload.status === 'active') {
      nextPayload.endedAt = null;
    } else if (!group.endedAt) {
      nextPayload.endedAt = new Date();
    }

    group.set(nextPayload);
    const savedGroup = await group.save();

    if (statusChanged && payload.status === 'archived') {
      const archivedAt = savedGroup.endedAt || new Date();
      const students = await Student.find({ $or: [{ groupId: savedGroup._id }, { 'enrollments.groupId': savedGroup._id }], status: { $ne: 'left' } });

      await Promise.all(
        students.map(async (student) => {
          const activeEnrollment = student.enrollmentHistory.find((item) => !item.endedAt && item.groupId.toString() === savedGroup.id);

          if (activeEnrollment) {
            activeEnrollment.endedAt = archivedAt;
            activeEnrollment.endReason = 'Guruh arxivlandi';
          } else if (!student.enrollmentHistory.length) {
            student.enrollmentHistory.push({
              groupId: savedGroup._id,
              groupName: savedGroup.name,
              subject: savedGroup.subject,
              startedAt: student.createdAt,
              endedAt: archivedAt,
              endReason: 'Guruh arxivlandi',
            });
          }

          const courseEnrollment = student.enrollments.find((item) => item.status === 'active' && item.groupId.toString() === savedGroup.id);
          if (courseEnrollment) {
            courseEnrollment.status = 'finished';
            courseEnrollment.endedAt = archivedAt;
          }
          const remainingEnrollment = student.enrollments.find((item) => item.status === 'active');
          if (remainingEnrollment) {
            if (student.groupId.toString() === savedGroup.id) student.groupId = remainingEnrollment.groupId;
          } else {
            student.status = 'left';
            student.leftAt = archivedAt;
          }
          await student.save();
          await rebuildStudentBalances(student._id, archivedAt);
        }),
      );
    }

    const populatedGroup = await savedGroup.populate('teacherId');

    return res.json(toGroupResponse(populatedGroup));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Bu nom bilan guruh allaqachon mavjud' });
    }

    return res.status(400).json({ message: "Guruh ma'lumotini yangilashda xatolik", error: error.message });
  }
}

export async function deleteGroup(req, res) {
  try {
    const group = await Group.findByIdAndDelete(req.params.id);

    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi' });
    }

    return res.json({ message: "Guruh o'chirildi", id: req.params.id });
  } catch (error) {
    return res.status(500).json({ message: "Guruhni o'chirishda xatolik", error: error.message });
  }
}
