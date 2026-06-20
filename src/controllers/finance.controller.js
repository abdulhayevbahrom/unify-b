import { Group } from '../models/group.model.js';
import { CashClosure } from '../models/cash-closure.model.js';
import { Notification } from '../models/notification.model.js';
import { Payment } from '../models/payment.model.js';
import { StudentMonthlyBalance } from '../models/student-monthly-balance.model.js';
import { StudentPause } from '../models/student-pause.model.js';
import { Student } from '../models/student.model.js';
import { emitToRole } from '../socket.js';

const paymentMethods = ['cash', 'bank_transfer', 'click'];

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthStart(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1);
}

function getMonthEnd(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0, 23, 59, 59, 999);
}

function getMonthsBetween(startDate, endDate) {
  const months = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  if (cursor > end) {
    return months;
  }

  while (cursor <= end) {
    months.push(toMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function getGroupEndDiscount(month, monthlyPrice, endedAt) {
  if (!endedAt) return 0;

  const monthStart = getMonthStart(month);
  const monthEnd = getMonthEnd(month);

  if (endedAt < monthStart) return monthlyPrice;
  if (endedAt > monthEnd) return 0;

  const daysInMonth = monthEnd.getDate();
  const unpaidDays = daysInMonth - endedAt.getDate() + 1;

  return Math.min(monthlyPrice, Math.round((monthlyPrice / daysInMonth) * unpaidDays));
}

function getPriceForMonth(group, month) {
  const monthStart = getMonthStart(month);
  const monthEnd = getMonthEnd(month);
  const priceItem = [...(group.priceHistory || [])]
    .reverse()
    .find((item) => item.startedAt <= monthEnd && (!item.endedAt || item.endedAt >= monthStart));

  return priceItem?.price || group.monthlyPrice || 0;
}

function getPauseDiscount(month, monthlyPrice, pauses) {
  const monthStart = getMonthStart(month);
  const monthEnd = getMonthEnd(month);
  const daysInMonth = monthEnd.getDate();
  const pausedDays = new Set();

  pauses.forEach((pause) => {
    const pauseStart = pause.startDate > monthStart ? pause.startDate : monthStart;
    const pauseEndDate = pause.endDate || monthEnd;
    const pauseEnd = pauseEndDate < monthEnd ? pauseEndDate : monthEnd;

    if (pause.status === 'cancelled' || pauseStart > pauseEnd) return;

    const cursor = new Date(pauseStart.getFullYear(), pauseStart.getMonth(), pauseStart.getDate());
    const end = new Date(pauseEnd.getFullYear(), pauseEnd.getMonth(), pauseEnd.getDate());

    while (cursor <= end) {
      pausedDays.add(cursor.getDate());
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return Math.min(monthlyPrice, Math.round((monthlyPrice / daysInMonth) * pausedDays.size));
}

function getCourseDiscount(month, monthlyPrice, enrollment) {
  const monthStart = getMonthStart(month);
  const monthEnd = getMonthEnd(month);
  const historyItem = enrollment.discountHistory?.find((item) => item.startedAt <= monthEnd && (!item.endedAt || item.endedAt >= monthStart));
  const hasHistory = Boolean(enrollment.discountHistory?.length);
  const type = hasHistory ? historyItem?.type : enrollment.discountType;
  const value = Math.max(Number(hasHistory ? historyItem?.value : enrollment.discountValue) || 0, 0);
  if (type === 'percentage') return Math.min(monthlyPrice, Math.round(monthlyPrice * Math.min(value, 100) / 100));
  if (type === 'fixed') return Math.min(monthlyPrice, value);
  return 0;
}

function getBalanceStatus(chargedAmount, paidAmount) {
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount < chargedAmount) return 'partial';
  if (paidAmount === chargedAmount) return 'paid';
  return 'overpaid';
}

function toBalanceResponse(balance) {
  const data = balance.toObject({ virtuals: true });

  return {
    ...data,
    status: data.status || 'active',
    id: data._id.toString(),
    studentId: data.studentId?.toString(),
    groupId: data.groupId?.toString(),
    _id: undefined,
    __v: undefined,
  };
}

function toPaymentResponse(payment) {
  const data = payment.toObject({ virtuals: true });

  return {
    ...data,
    id: data._id.toString(),
    studentId: data.studentId?.toString(),
    createdBy: data.createdBy?.toString() || null,
    _id: undefined,
    __v: undefined,
  };
}

function toCashClosureResponse(closure) {
  const data = closure.toObject({ virtuals: true });
  const totalsByMethod = data.totalsByMethod instanceof Map ? Object.fromEntries(data.totalsByMethod) : data.totalsByMethod || {};

  return {
    ...data,
    id: data._id.toString(),
    paymentIds: data.paymentIds?.map((id) => id.toString()) || [],
    closedBy: data.closedBy?.toString() || null,
    totalsByMethod,
    _id: undefined,
    __v: undefined,
  };
}

function buildPaymentStats(payments) {
  const totalsByMethod = {};
  let totalAmount = 0;

  payments.forEach((payment) => {
    totalAmount += payment.amount;
    totalsByMethod[payment.method] = (totalsByMethod[payment.method] || 0) + payment.amount;
  });

  return { totalAmount, totalsByMethod };
}

function toPauseResponse(pause) {
  const data = pause.toObject({ virtuals: true });

  return {
    ...data,
    id: data._id.toString(),
    studentId: data.studentId?.toString(),
    groupId: data.groupId?.toString(),
    _id: undefined,
    __v: undefined,
  };
}

export async function rebuildStudentBalances(studentId, until = new Date(), excludedPaymentId = null) {
  const student = await Student.findById(studentId).populate('groupId').populate('enrollments.groupId');

  if (!student) {
    return null;
  }

  if (!student.groupId && !student.enrollments.length) {
    return { student, balances: [] };
  }
  if (!student.enrollments.length && student.groupId) {
    student.enrollments.push({ groupId: student.groupId._id, startedAt: student.createdAt, status: student.leftAt ? 'finished' : 'active', endedAt: student.leftAt });
    await student.save();
    await student.populate('enrollments.groupId');
  }
  const enrollmentPeriods = student.enrollments.filter((item) => item.groupId).map((item) => {
    const group = item.groupId;
    const endCandidates = [until, item.endedAt, group.endedAt].filter(Boolean);
    const effectiveUntil = new Date(Math.min(...endCandidates.map((date) => new Date(date).getTime())));
    return { enrollment: item, group, months: getMonthsBetween(new Date(item.startedAt), effectiveUntil) };
  });
  const [pauses, payments] = await Promise.all([
    StudentPause.find({ studentId, status: { $ne: 'cancelled' } }),
    Payment.find({ studentId, status: { $nin: ['cancelled', 'refunded'] }, ...(excludedPaymentId ? { _id: { $ne: excludedPaymentId } } : {}) }),
  ]);
  const paymentMap = new Map();

  payments.forEach((payment) => {
    payment.allocations.forEach((allocation) => {
      if (!allocation.month) return;
      const groupId = allocation.groupId?.toString() || student.groupId?._id?.toString() || student.groupId?.toString();
      const key = `${groupId}:${allocation.month}`;
      paymentMap.set(key, (paymentMap.get(key) || 0) + allocation.amount);
    });
  });

  const balances = [];
  for (const { enrollment, group, months } of enrollmentPeriods) {
    for (const month of months) {
    const key = `${group._id}:${month}`;
    const monthlyPriceSnapshot = getPriceForMonth(group, month);
    const courseDiscountAmount = getCourseDiscount(month, monthlyPriceSnapshot, enrollment);
    const priceAfterCourseDiscount = Math.max(monthlyPriceSnapshot - courseDiscountAmount, 0);
    const groupPauses = pauses.filter((pause) => pause.groupId.toString() === group._id.toString());
    const pauseDiscountAmount = Math.min(
      priceAfterCourseDiscount,
      getPauseDiscount(month, priceAfterCourseDiscount, groupPauses) + getGroupEndDiscount(month, priceAfterCourseDiscount, enrollment.endedAt || group.endedAt),
    );
    const chargedAmount = Math.max(priceAfterCourseDiscount - pauseDiscountAmount, 0);
    const directPaidAmount = Math.min(paymentMap.get(key) || 0, chargedAmount);
    const paidAmount = directPaidAmount;
    const debtAmount = Math.max(chargedAmount - paidAmount, 0);
    const status = getBalanceStatus(chargedAmount, paidAmount);

    const balance = await StudentMonthlyBalance.findOneAndUpdate(
      { studentId, groupId: group._id, month },
      {
        studentId,
        groupId: group._id,
        month,
        monthlyPriceSnapshot,
        chargedAmount,
        pauseDiscountAmount,
        courseDiscountAmount,
        paidAmount,
        debtAmount,
        advanceAppliedAmount: 0,
        status,
      },
      { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    balances.push(balance);
    }
  }
  let availableAdvance = payments.reduce((sum, payment) => sum + (payment.advanceAmount || 0), 0);

  if (availableAdvance > 0) {
    const debts = balances.filter((balance) => balance.debtAmount > 0).sort((a, b) => a.month.localeCompare(b.month));

    for (const balance of debts) {
      if (availableAdvance <= 0) break;

      const amount = Math.min(availableAdvance, balance.debtAmount);
      balance.advanceAppliedAmount += amount;
      balance.paidAmount += amount;
      balance.debtAmount = Math.max(balance.chargedAmount - balance.paidAmount, 0);
      balance.status = getBalanceStatus(balance.chargedAmount, balance.paidAmount);
      await balance.save();
      availableAdvance -= amount;
    }
  }

  const totalDebt = balances.reduce((sum, balance) => sum + balance.debtAmount, 0);
  const nextPaymentStatus = totalDebt > 0 ? 'debt' : 'paid';

  if (student.paymentStatus !== nextPaymentStatus || student.advanceBalance !== availableAdvance) {
    student.paymentStatus = nextPaymentStatus;
    student.advanceBalance = availableAdvance;
    await student.save();
  }

  return { student, balances };
}

export async function getStudentFinance(req, res) {
  try {
    const until = req.query.until ? getMonthEnd(req.query.until) : new Date();
    const rebuilt = await rebuildStudentBalances(req.params.studentId, until);

    if (!rebuilt) {
      return res.status(404).json({ message: "O'quvchi topilmadi" });
    }

    const [payments, pauses] = await Promise.all([
      Payment.find({ studentId: req.params.studentId }).sort({ paidAt: -1 }),
      StudentPause.find({ studentId: req.params.studentId }).sort({ startDate: -1 }),
    ]);
    const balances = rebuilt.balances.sort((a, b) => a.month.localeCompare(b.month));
    const totalDebt = balances.reduce((sum, balance) => sum + balance.debtAmount, 0);

    return res.json({
      summary: {
        totalDebt,
        advanceBalance: rebuilt.student.advanceBalance || 0,
        paymentStatus: totalDebt > 0 ? 'debt' : 'paid',
      },
      balances: balances.map(toBalanceResponse),
      payments: payments.map(toPaymentResponse),
      pauses: pauses.map(toPauseResponse),
      enrollments: rebuilt.student.enrollments.map((item) => ({
        id: item._id.toString(),
        groupId: item.groupId?._id?.toString() || item.groupId?.toString(),
        groupName: item.groupId?.name || '-',
        subject: item.groupId?.subject || '-',
        startedAt: item.startedAt,
        endedAt: item.endedAt || null,
        status: item.status,
        discountType: item.discountType || 'none',
        discountValue: item.discountValue || 0,
        discountReason: item.discountReason || '',
      })),
      paymentMethods,
    });
  } catch (error) {
    return res.status(500).json({ message: "O'quvchi to'lovlarini olishda xatolik", error: error.message });
  }
}

async function preparePayment(studentId, body, excludedPaymentId = null) {
  const amount = Number(body.amount) || 0;
  const method = body.method;
  if (amount <= 0) throw new Error("To'lov summasi 0 dan katta bo'lishi kerak");
  if (!paymentMethods.includes(method)) throw new Error("To'lov usuli noto'g'ri");
  const rebuilt = await rebuildStudentBalances(studentId, new Date(), excludedPaymentId);
  if (!rebuilt) throw new Error("O'quvchi topilmadi");
  const debts = rebuilt.balances.filter((balance) => balance.debtAmount > 0).sort((a, b) => a.month.localeCompare(b.month));
  if (body.isAdvance && debts.length) throw new Error("Oldindan to'lov qilishdan avval mavjud eski qarzlarni yoping");

  let remainder = amount;
  const allocations = [];
  const targetMonth = body.targetMonth?.trim();
  const targetBalanceId = body.targetBalanceId?.trim();
  let targetBalance = null;
  if (!body.isAdvance && (targetMonth || targetBalanceId)) {
    targetBalance = debts.find((balance) => targetBalanceId ? balance._id.toString() === targetBalanceId : balance.month === targetMonth);
    if (!targetBalance) throw new Error('Tanlangan oyda qarz mavjud emas');
    if (debts.some((balance) => balance.month < targetBalance.month)) {
      throw new Error("Bu oyni to'lashdan avval eski oylar qarzini yoping");
    }
  }

  const orderedDebts = targetBalance ? [targetBalance, ...debts.filter((item) => item.id !== targetBalance.id)] : debts;
  if (!body.isAdvance) {
    for (const balance of orderedDebts) {
      if (remainder <= 0) break;
      const allocationAmount = Math.min(remainder, balance.debtAmount);
      allocations.push({ monthlyBalanceId: balance._id, groupId: balance.groupId, month: balance.month, amount: allocationAmount });
      remainder -= allocationAmount;
    }
  }
  return { amount, method, allocations, advanceAmount: remainder, paidAt: body.paidAt || new Date(), note: body.note?.trim() || '' };
}

export async function createPayment(req, res) {
  try {
    const data = await preparePayment(req.params.studentId, req.body);
    const payment = await Payment.create({ studentId: req.params.studentId, ...data, createdBy: req.user._id });
    await rebuildStudentBalances(req.params.studentId);
    return res.status(201).json(toPaymentResponse(payment));
  } catch (error) {
    return res.status(400).json({ message: error.message || "To'lovni saqlashda xatolik" });
  }
}

export async function updatePayment(req, res) {
  try {
    if (req.user.role !== 'owner') return res.status(403).json({ message: 'To‘lovni faqat owner tahrirlashi mumkin' });
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'To‘lov topilmadi' });
    if (payment.status !== 'active' || payment.cashStatus !== 'open') {
      return res.status(409).json({ message: 'Faqat yopilmagan kassadagi faol to‘lovni tahrirlash mumkin' });
    }
    const data = await preparePayment(payment.studentId, req.body, payment._id);
    payment.editHistory.push({ amount: payment.amount, method: payment.method, paidAt: payment.paidAt, note: payment.note, editedBy: req.user._id });
    payment.set(data);
    await payment.save();
    await rebuildStudentBalances(payment.studentId);
    return res.json(toPaymentResponse(payment));
  } catch (error) {
    return res.status(400).json({ message: error.message || 'To‘lovni yangilab bo‘lmadi' });
  }
}

export async function getPaymentsHistory(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const filter = {};
    if (req.query.studentId) filter.studentId = req.query.studentId;
    if (paymentMethods.includes(req.query.method)) filter.method = req.query.method;
    if (['active', 'cancelled', 'refunded'].includes(req.query.status)) filter.status = req.query.status;
    if (['open', 'pending_owner', 'approved'].includes(req.query.cashStatus)) filter.cashStatus = req.query.cashStatus;
    if (req.query.dateFrom || req.query.dateTo) {
      filter.paidAt = {};
      if (req.query.dateFrom) filter.paidAt.$gte = new Date(`${req.query.dateFrom}T00:00:00`);
      if (req.query.dateTo) filter.paidAt.$lte = new Date(`${req.query.dateTo}T23:59:59.999`);
    }
    if (req.query.search?.trim()) {
      const escapedSearch = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matchingStudents = await Student.find({
        $or: [{ fullName: new RegExp(escapedSearch, 'i') }, { phone: new RegExp(escapedSearch, 'i') }],
      }).select('_id');
      filter.studentId = { $in: matchingStudents.map((student) => student._id) };
    }
    const payments = await Payment.find(filter).populate('studentId', 'fullName phone').populate('createdBy', 'fullName').sort({ paidAt: -1 }).skip((page - 1) * limit).limit(limit);
    const total = await Payment.countDocuments(filter);
    return res.json({
      data: payments.map((payment) => ({ ...payment.toJSON(), student: payment.studentId ? { id: payment.studentId._id.toString(), fullName: payment.studentId.fullName, phone: payment.studentId.phone } : null })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  } catch (error) {
    return res.status(500).json({ message: 'To‘lovlar tarixini olib bo‘lmadi', error: error.message });
  }
}

export async function reversePayment(req, res) {
  try {
    if (req.user.role !== 'owner') return res.status(403).json({ message: 'To‘lovni faqat owner bekor qilishi mumkin' });
    const reason = req.body.reason?.trim();
    if (!reason) return res.status(400).json({ message: 'Bekor qilish sababini kiriting' });
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'To‘lov topilmadi' });
    if (payment.status !== 'active') return res.status(409).json({ message: 'Bu to‘lov avval bekor qilingan' });
    if (payment.cashStatus === 'pending_owner') return res.status(409).json({ message: 'Avval kassa tasdig‘ini yakunlang' });
    payment.status = payment.cashStatus === 'approved' ? 'refunded' : 'cancelled';
    payment.reversalReason = reason;
    payment.reversedAt = new Date();
    payment.reversedBy = req.user._id;
    await payment.save();
    await rebuildStudentBalances(payment.studentId);
    return res.json(toPaymentResponse(payment));
  } catch (error) {
    return res.status(400).json({ message: 'To‘lovni bekor qilib bo‘lmadi', error: error.message });
  }
}

export async function createStudentPause(req, res) {
  try {
    const student = await Student.findById(req.params.studentId);

    if (!student) {
      return res.status(404).json({ message: "O'quvchi topilmadi" });
    }

    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    if (!startDate || Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ message: 'Pauza boshlanish sanasi kiritilishi kerak' });
    }

    if (endDate && startDate > endDate) {
      return res.status(400).json({ message: "Pauza tugash sanasi boshlanishdan keyin bo'lishi kerak" });
    }

    const pause = await StudentPause.create({
      studentId: student._id,
      groupId: student.groupId,
      startDate,
      endDate: null,
      reason: req.body.reason?.trim() || '',
      status: 'active',
    });

    student.status = 'paused';
    await student.save();
    await rebuildStudentBalances(req.params.studentId);

    return res.status(201).json(toPauseResponse(pause));
  } catch (error) {
    return res.status(400).json({ message: 'Pauzani saqlashda xatolik', error: error.message });
  }
}

export async function activatePausedStudent(req, res) {
  try {
    const student = await Student.findById(req.params.studentId).populate('groupId');

    if (!student) {
      return res.status(404).json({ message: "O'quvchi topilmadi" });
    }

    if (!student.groupId || student.groupId.status === 'archived' || student.status === 'left') {
      return res.status(400).json({ message: "Tarixdagi o'quvchini qayta faollashtirib bo'lmaydi" });
    }

    const activePause = await StudentPause.findOne({ studentId: student._id, status: 'active' }).sort({ startDate: -1 });

    if (activePause) {
      activePause.endDate = new Date();
      activePause.status = 'finished';
      await activePause.save();
    }

    student.status = 'active';
    await student.save();
    await rebuildStudentBalances(req.params.studentId);

    return res.json({ message: "O'quvchi aktiv holatga qaytarildi" });
  } catch (error) {
    return res.status(400).json({ message: "O'quvchini aktiv qilishda xatolik", error: error.message });
  }
}

export async function getPaymentsDashboard(req, res) {
  try {
    const [openPayments, approvedClosures, pendingClosures] = await Promise.all([
      Payment.find({ cashStatus: 'open', status: { $nin: ['cancelled', 'refunded'] } }).sort({ paidAt: -1 }),
      CashClosure.find({ status: 'approved' }).sort({ to: -1 }).limit(20),
      CashClosure.find({ status: 'pending_owner' }).sort({ to: -1 }).limit(20),
    ]);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayPayments = openPayments.filter((payment) => payment.paidAt >= todayStart);
    const openStats = buildPaymentStats(openPayments);
    const todayStats = buildPaymentStats(todayPayments);

    return res.json({
      openPeriod: {
        totalAmount: openStats.totalAmount,
        totalsByMethod: openStats.totalsByMethod,
        paymentsCount: openPayments.length,
        payments: openPayments.map(toPaymentResponse),
      },
      today: {
        totalAmount: todayStats.totalAmount,
        totalsByMethod: todayStats.totalsByMethod,
        paymentsCount: todayPayments.length,
      },
      approvedClosures: approvedClosures.map(toCashClosureResponse),
      pendingClosures: pendingClosures.map(toCashClosureResponse),
    });
  } catch (error) {
    return res.status(500).json({ message: "To'lovlar dashboardini olishda xatolik", error: error.message });
  }
}

export async function getDebtors(_req, res) {
  try {
    const debts = await StudentMonthlyBalance.aggregate([
      { $match: { debtAmount: { $gt: 0 } } },
      { $sort: { month: 1 } },
      {
        $group: {
          _id: '$studentId',
          totalDebt: { $sum: '$debtAmount' },
          months: { $push: { balanceId: '$_id', groupId: '$groupId', month: '$month', debtAmount: '$debtAmount' } },
        },
      },
      { $sort: { totalDebt: -1 } },
      { $limit: 100 },
    ]);
    const groupIds = [...new Set(debts.flatMap((item) => item.months.map((month) => month.groupId.toString())))];
    const [students, groups] = await Promise.all([Student.find({ _id: { $in: debts.map((item) => item._id) } }).populate({
      path: 'groupId',
      populate: { path: 'teacherId' },
    }), Group.find({ _id: { $in: groupIds } })]);
    const studentMap = new Map(students.map((student) => [student._id.toString(), student]));
    const groupMap = new Map(groups.map((group) => [group.id, group.name]));

    return res.json({
      data: debts.map((debt) => {
        const student = studentMap.get(debt._id.toString());

        return {
          studentId: debt._id.toString(),
          fullName: student?.fullName || '-',
          phone: student?.phone || '-',
          secondaryPhone: student?.secondaryPhone || '',
          groupName: [...new Set(debt.months.map((month) => groupMap.get(month.groupId.toString()) || '-'))].join(', '),
          totalDebt: debt.totalDebt,
          months: debt.months.map((month) => ({ balanceId: month.balanceId.toString(), groupId: month.groupId.toString(), groupName: groupMap.get(month.groupId.toString()) || '-', month: month.month, debtAmount: month.debtAmount })),
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: "Qarzdorlar ro'yxatini olishda xatolik", error: error.message });
  }
}

export async function closeCashRegister(req, res) {
  try {
    const openPayments = await Payment.find({ cashStatus: 'open', status: { $nin: ['cancelled', 'refunded'] } }).sort({ paidAt: 1 });

    if (!openPayments.length) {
      return res.status(400).json({ message: "Yopilmagan to'lovlar mavjud emas" });
    }

    const stats = buildPaymentStats(openPayments);
    const closure = await CashClosure.create({
      from: openPayments[0].paidAt,
      to: new Date(),
      totalAmount: stats.totalAmount,
      totalsByMethod: stats.totalsByMethod,
      paymentsCount: openPayments.length,
      paymentIds: openPayments.map((payment) => payment._id),
      status: 'pending_owner',
      closedBy: req.user._id,
    });

    await Payment.updateMany(
      { _id: { $in: openPayments.map((payment) => payment._id) } },
      { cashClosureId: closure._id, cashStatus: 'pending_owner' },
    );

    const notification = await Notification.create({
      role: 'owner',
      type: 'cash_closure',
      title: 'Kassa yopildi',
      message: `${openPayments.length} ta to'lov, jami ${stats.totalAmount.toLocaleString('uz-UZ')} so'm. Owner tasdig'i kutilmoqda.`,
      relatedId: closure._id,
    });
    const closureResponse = toCashClosureResponse(closure);

    emitToRole('owner', 'notification:new', {
      notification: notification.toJSON(),
      closure: closureResponse,
    });

    return res.status(201).json(closureResponse);
  } catch (error) {
    return res.status(400).json({ message: 'Kassani yopishda xatolik', error: error.message });
  }
}

export async function reviewCashClosure(req, res) {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Kassani faqat owner tasdiqlashi mumkin' });
    }

    const status = req.body.status;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: "Status 'approved' yoki 'rejected' bo'lishi kerak" });
    }

    const closure = await CashClosure.findById(req.params.closureId);

    if (!closure) {
      return res.status(404).json({ message: 'Kassa yopilishi topilmadi' });
    }

    closure.status = status;
    closure.ownerNote = req.body.ownerNote?.trim() || '';
    closure.reviewedAt = new Date();
    await closure.save();

    await Payment.updateMany(
      { cashClosureId: closure._id },
      { cashStatus: status === 'approved' ? 'approved' : 'open', cashClosureId: status === 'approved' ? closure._id : null },
    );

    await Notification.updateMany({ type: 'cash_closure', relatedId: closure._id }, { status: 'read' });
    emitToRole('owner', 'cash-closure:reviewed', toCashClosureResponse(closure));

    return res.json(toCashClosureResponse(closure));
  } catch (error) {
    return res.status(400).json({ message: 'Kassa yopilishini tekshirishda xatolik', error: error.message });
  }
}

export async function updateStudentPause(req, res) {
  try {
    const pause = await StudentPause.findOne({ _id: req.params.pauseId, studentId: req.params.studentId });

    if (!pause) {
      return res.status(404).json({ message: 'Pauza topilmadi' });
    }

    const startDate = req.body.startDate ? new Date(req.body.startDate) : pause.startDate;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : req.body.endDate === null ? null : pause.endDate;

    if (endDate && startDate > endDate) {
      return res.status(400).json({ message: "Pauza tugash sanasi boshlanishdan keyin bo'lishi kerak" });
    }

    pause.set({
      startDate,
      endDate,
      reason: req.body.reason?.trim() || '',
      status: req.body.status || pause.status,
    });

    const savedPause = await pause.save();
    await rebuildStudentBalances(req.params.studentId);

    return res.json(toPauseResponse(savedPause));
  } catch (error) {
    return res.status(400).json({ message: 'Pauzani yangilashda xatolik', error: error.message });
  }
}
