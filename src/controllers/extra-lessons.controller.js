import { ExtraLesson } from '../models/extra-lesson.model.js';
import { Group } from '../models/group.model.js';
import { Payment } from '../models/payment.model.js';
import { Student } from '../models/student.model.js';

const paymentMethods = ['cash', 'bank_transfer', 'click'];

function toResponse(lesson) {
  const data = lesson.toObject({ virtuals: true });
  const student = data.studentId && typeof data.studentId === 'object' ? data.studentId : null;
  const group = data.groupId && typeof data.groupId === 'object' ? data.groupId : null;
  const debtAmount = Math.max(Number(data.fee) - Number(data.paidAmount || 0), 0);

  return {
    ...data,
    id: data._id.toString(),
    studentId: student?._id?.toString() || data.studentId?.toString(),
    groupId: group?._id?.toString() || data.groupId?.toString(),
    student: student ? { id: student._id.toString(), fullName: student.fullName, phone: student.phone } : null,
    group: group ? { id: group._id.toString(), name: group.name, subject: group.subject } : null,
    debtAmount,
    _id: undefined,
    __v: undefined,
  };
}

async function getLesson(id) {
  return ExtraLesson.findById(id).populate('studentId', 'fullName phone').populate('groupId', 'name subject');
}

export async function getExtraLessons(req, res) {
  try {
    const filter = {};
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (req.query.groupId) filter.groupId = req.query.groupId;
    if (['scheduled', 'completed', 'cancelled'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.dateFrom || req.query.dateTo) {
      filter.scheduledAt = {};
      if (req.query.dateFrom) filter.scheduledAt.$gte = new Date(`${req.query.dateFrom}T00:00:00`);
      if (req.query.dateTo) filter.scheduledAt.$lte = new Date(`${req.query.dateTo}T23:59:59.999`);
    }
    const lessons = await ExtraLesson.find(filter)
      .populate('studentId', 'fullName phone')
      .populate('groupId', 'name subject')
      .sort({ scheduledAt: -1 })
      .limit(200);
    return res.json({ data: lessons.map(toResponse) });
  } catch (error) {
    return res.status(500).json({ message: "Qo'shimcha darslarni olishda xatolik", error: error.message });
  }
}

export async function createExtraLesson(req, res) {
  try {
    const fee = Number(req.body.fee);
    const durationMinutes = Number(req.body.durationMinutes) || 60;
    const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (!req.body.studentId) return res.status(400).json({ message: "O'quvchini tanlang" });
    if (!req.body.groupId) return res.status(400).json({ message: 'Guruhni tanlang' });
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ message: 'Dars sanasi va vaqtini kiriting' });
    if (!Number.isFinite(fee) || fee < 1000) return res.status(400).json({ message: "Qo'shimcha dars to'lovi kamida 1 000 so'm bo'lishi kerak" });
    if (durationMinutes < 15 || durationMinutes > 480) return res.status(400).json({ message: 'Dars davomiyligi 15-480 daqiqa oralig‘ida bo‘lishi kerak' });

    const [student, group] = await Promise.all([Student.findById(req.body.studentId), Group.findById(req.body.groupId)]);
    if (!student || !group) return res.status(404).json({ message: "O'quvchi yoki guruh topilmadi" });

    const lesson = await ExtraLesson.create({
      studentId: student._id,
      groupId: group._id,
      scheduledAt,
      durationMinutes,
      reason: req.body.reason?.trim() || '',
      fee,
      createdBy: req.user._id,
    });
    return res.status(201).json(toResponse(await getLesson(lesson._id)));
  } catch (error) {
    return res.status(400).json({ message: "Qo'shimcha darsni saqlashda xatolik", error: error.message });
  }
}

export async function updateExtraLesson(req, res) {
  try {
    const lesson = await ExtraLesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: "Qo'shimcha dars topilmadi" });
    if (['scheduled', 'completed', 'cancelled'].includes(req.body.status)) lesson.status = req.body.status;
    if (req.body.reason !== undefined) lesson.reason = req.body.reason.trim();
    if (req.body.scheduledAt !== undefined) {
      const scheduledAt = new Date(req.body.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ message: 'Dars sanasi va vaqti noto‘g‘ri' });
      lesson.scheduledAt = scheduledAt;
    }
    if (req.body.durationMinutes !== undefined) {
      const durationMinutes = Number(req.body.durationMinutes);
      if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) return res.status(400).json({ message: 'Dars davomiyligi 15-480 daqiqa oralig‘ida bo‘lishi kerak' });
      lesson.durationMinutes = durationMinutes;
    }
    if (req.body.fee !== undefined) {
      const fee = Number(req.body.fee);
      if (!Number.isFinite(fee) || fee < 1000) return res.status(400).json({ message: "Qo'shimcha dars to'lovi kamida 1 000 so'm bo'lishi kerak" });
      if (fee < lesson.paidAmount) return res.status(400).json({ message: "Narx olingan to'lovdan kam bo'lishi mumkin emas" });
      lesson.fee = fee;
    }
    await lesson.save();
    return res.json(toResponse(await getLesson(lesson._id)));
  } catch (error) {
    return res.status(400).json({ message: "Qo'shimcha darsni yangilab bo'lmadi", error: error.message });
  }
}

export async function createExtraLessonPayment(req, res) {
  try {
    const lesson = await ExtraLesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ message: "Qo'shimcha dars topilmadi" });
    if (lesson.status === 'cancelled') return res.status(409).json({ message: 'Bekor qilingan dars uchun to‘lov olib bo‘lmaydi' });
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "To'lov summasini kiriting" });
    if (!paymentMethods.includes(req.body.method)) return res.status(400).json({ message: "To'lov usuli noto'g'ri" });
    const debtAmount = Math.max(lesson.fee - lesson.paidAmount, 0);
    if (amount > debtAmount) return res.status(400).json({ message: `Qarzdan ortiq to'lov olib bo'lmaydi (${debtAmount.toLocaleString('uz-UZ')} so'm)` });

    const payment = await Payment.create({
      studentId: lesson.studentId,
      extraLessonId: lesson._id,
      amount,
      method: req.body.method,
      paidAt: req.body.paidAt || new Date(),
      note: req.body.note?.trim() || "Qo'shimcha dars to'lovi",
      createdBy: req.user._id,
    });
    lesson.paidAmount += amount;
    await lesson.save();
    return res.status(201).json({ payment: payment.toJSON(), lesson: toResponse(await getLesson(lesson._id)) });
  } catch (error) {
    return res.status(400).json({ message: "Qo'shimcha dars to'lovini saqlashda xatolik", error: error.message });
  }
}
