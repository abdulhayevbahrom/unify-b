import { EmployeeSalaryTransaction } from '../models/employee-salary-transaction.model.js';
import { Group } from '../models/group.model.js';
import { Payment } from '../models/payment.model.js';
import { StudentPause } from '../models/student-pause.model.js';
import { Student } from '../models/student.model.js';
import { Teacher } from '../models/teacher.model.js';
import { User } from '../models/user.model.js';

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function getCurrentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthStart(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1);
}

function getMonthEnd(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0, 23, 59, 59, 999);
}

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonth(month) {
  return monthPattern.test(month || '') ? month : getCurrentMonth();
}

function buildSearchRegex(search) {
  const normalizedSearch = search?.trim();
  return normalizedSearch ? new RegExp(normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
}

function buildUserFilter(searchRegex) {
  const filter = { role: { $ne: 'teacher' } };

  if (searchRegex) {
    filter.$or = [
      { fullName: searchRegex },
      { username: searchRegex },
      { role: searchRegex },
    ];
  }

  return filter;
}

function buildTeacherFilter(searchRegex) {
  if (!searchRegex) return {};

  return {
    $or: [
      { fullName: searchRegex },
      { subject: searchRegex },
      { phone: searchRegex },
    ],
  };
}

function getMonthsCountUntil(startDate, month) {
  const startMonth = toMonthKey(startDate || new Date());

  if (startMonth > month) return 0;

  const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = month.split('-').map(Number);

  return (endYear - startYear) * 12 + endMonthNumber - startMonthNumber + 1;
}

function getMonthsBetweenKeys(startMonth, endMonth) {
  const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number);
  const cursor = new Date(startYear, startMonthNumber - 1, 1);
  const end = new Date(endYear, endMonthNumber - 1, 1);
  const months = [];

  while (cursor <= end) {
    months.push(toMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
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

function getEnrollmentMonths(enrollment, untilMonth) {
  const startMonth = toMonthKey(enrollment.startedAt);
  const endMonth = enrollment.endedAt ? toMonthKey(enrollment.endedAt) : untilMonth;

  if (startMonth > untilMonth || endMonth < startMonth) return [];

  return getMonthsBetweenKeys(startMonth, endMonth < untilMonth ? endMonth : untilMonth);
}

function getStudentEnrollments(student) {
  if (student.enrollmentHistory?.length) return student.enrollmentHistory;

  return [
    {
      groupId: student.groupId,
      startedAt: student.createdAt,
      endedAt: student.leftAt || null,
    },
  ];
}

function emptyTeacherStats() {
  return {
    groupsCount: 0,
    chargedAmount: 0,
    paidAmount: 0,
    throughChargedAmount: 0,
    throughPaidAmount: 0,
  };
}

function buildTransactionTotals(transactions) {
  return transactions.reduce(
    (totals, transaction) => {
      if (transaction.kind === 'salary') totals.salary += transaction.amount;
      if (transaction.kind === 'advance') totals.advance += transaction.amount;
      if (transaction.kind === 'salary_payment') totals.paidSalary += transaction.amount;

      totals.balance = totals.salary - totals.advance - totals.paidSalary;
      return totals;
    },
    { salary: 0, advance: 0, paidSalary: 0, balance: 0 },
  );
}

function toSalaryTransactionResponse(transaction) {
  return transaction.toJSON();
}

async function buildTeacherStats(teachers, month) {
  const teacherIds = teachers.map((teacher) => teacher._id);
  const groups = await Group.find({
    teacherId: { $in: teacherIds },
    startDate: { $lte: getMonthEnd(month) },
  });
  const groupIds = groups.map((group) => group._id);
  const groupMap = new Map(groups.map((group) => [group._id.toString(), group]));
  const groupTeacherMap = new Map(groups.map((group) => [group._id.toString(), group.teacherId.toString()]));
  const [students, pauses, payments] = await Promise.all([
    Student.find({
      $or: [{ groupId: { $in: groupIds } }, { 'enrollmentHistory.groupId': { $in: groupIds } }],
    }),
    StudentPause.find({ groupId: { $in: groupIds }, status: { $ne: 'cancelled' } }),
    Payment.find({ 'allocations.month': { $lte: month }, status: { $nin: ['cancelled', 'refunded'] }, cashStatus: 'approved' }),
  ]);
  const paidByGroupMonth = new Map();
  const statsByTeacher = new Map();

  groups.forEach((group) => {
    const teacherId = group.teacherId.toString();
    const stats = statsByTeacher.get(teacherId) || emptyTeacherStats();
    stats.groupsCount += 1;
    statsByTeacher.set(teacherId, stats);
  });

  payments.forEach((payment) => {
    const student = students.find((item) => item._id.toString() === payment.studentId.toString());
    if (!student) return;

    payment.allocations.forEach((allocation) => {
      if (!allocation.month || allocation.month > month) return;

      const enrollment = getStudentEnrollments(student).find((item) => {
        const groupId = item.groupId?.toString();
        return groupMap.has(groupId) && getEnrollmentMonths(item, month).includes(allocation.month);
      });

      if (!enrollment) return;

      const key = `${enrollment.groupId.toString()}:${allocation.month}`;
      paidByGroupMonth.set(key, (paidByGroupMonth.get(key) || 0) + allocation.amount);
    });
  });

  students.forEach((student) => {
    getStudentEnrollments(student).forEach((enrollment) => {
      const groupId = enrollment.groupId?.toString();
      const group = groupMap.get(groupId);
      const teacherId = groupTeacherMap.get(groupId);

      if (!group || !teacherId) return;

      getEnrollmentMonths(enrollment, month).forEach((enrollmentMonth) => {
        const monthlyPrice = getPriceForMonth(group, enrollmentMonth);
        const studentPauses = pauses.filter(
          (pause) =>
            pause.studentId.toString() === student._id.toString()
            && pause.groupId.toString() === groupId
            && pause.startDate <= getMonthEnd(enrollmentMonth)
            && (!pause.endDate || pause.endDate >= getMonthStart(enrollmentMonth)),
        );
        const chargedAmount = Math.max(monthlyPrice - getPauseDiscount(enrollmentMonth, monthlyPrice, studentPauses), 0);
        const stats = statsByTeacher.get(teacherId) || emptyTeacherStats();

        stats.throughChargedAmount += chargedAmount;
        if (enrollmentMonth === month) stats.chargedAmount += chargedAmount;
        statsByTeacher.set(teacherId, stats);
      });
    });
  });

  paidByGroupMonth.forEach((paidAmount, key) => {
    const [groupId, paidMonth] = key.split(':');
    const teacherId = groupTeacherMap.get(groupId);
    if (!teacherId) return;

    const stats = statsByTeacher.get(teacherId) || emptyTeacherStats();
    stats.throughPaidAmount += paidAmount;
    if (paidMonth === month) stats.paidAmount += paidAmount;
    statsByTeacher.set(teacherId, stats);
  });

  return statsByTeacher;
}

function buildRecipient({ targetType, item, transactions, month, teacherStats }) {
  const targetId = item._id.toString();
  const ownTransactions = transactions.filter(
    (transaction) => transaction.targetType === targetType && transaction.targetId.toString() === targetId,
  );
  const monthTotals = buildTransactionTotals(ownTransactions.filter((transaction) => transaction.month === month));
  const totalTotals = buildTransactionTotals(ownTransactions.filter((transaction) => transaction.month <= month));
  const monthlySalary = Number(item.monthlySalary || 0);
  const paymentStats = targetType === 'teacher' ? teacherStats.get(targetId) || emptyTeacherStats() : null;
  const salaryType = targetType === 'teacher' && item.salaryType === 'percentage' ? 'percentage' : 'fixed';
  const salaryPercentage = targetType === 'teacher' ? Number(item.salaryPercentage || 0) : 0;
  const automaticMonthSalary =
    salaryType === 'percentage'
      ? Math.round(((paymentStats?.chargedAmount || 0) * salaryPercentage) / 100)
      : item.createdAt <= getMonthEnd(month)
        ? monthlySalary
        : 0;
  const automaticTotalSalary =
    salaryType === 'percentage'
      ? Math.round(((paymentStats?.throughChargedAmount || 0) * salaryPercentage) / 100)
      : monthlySalary * getMonthsCountUntil(item.createdAt, month);
  const monthSalaryAmount = automaticMonthSalary + monthTotals.salary;
  const totalSalaryAmount = automaticTotalSalary + totalTotals.salary;
  const monthBalance = monthSalaryAmount - monthTotals.advance - monthTotals.paidSalary;
  const totalBalance = totalSalaryAmount - totalTotals.advance - totalTotals.paidSalary;

  return {
    targetType,
    targetId,
    fullName: item.fullName,
    role: targetType === 'teacher' ? "O'qituvchi" : item.role === 'owner' ? 'Owner' : 'Hodim',
    status: item.status,
    monthlySalary,
    salaryType,
    salaryPercentage,
    month: {
      salaryAmount: monthSalaryAmount,
      advanceAmount: monthTotals.advance,
      paidSalaryAmount: monthTotals.paidSalary,
      balance: monthBalance,
    },
    total: {
      salaryAmount: totalSalaryAmount,
      advanceAmount: totalTotals.advance,
      paidSalaryAmount: totalTotals.paidSalary,
      balance: totalBalance,
      receivableAmount: totalBalance,
    },
    paymentStats: paymentStats
      ? {
          ...paymentStats,
          paymentPercentage: paymentStats.chargedAmount > 0
            ? Math.round((paymentStats.paidAmount / paymentStats.chargedAmount) * 1000) / 10
            : 0,
          salaryFromPercentage: salaryType === 'percentage'
            ? Math.round((paymentStats.chargedAmount * salaryPercentage) / 100)
            : 0,
        }
      : null,
  };
}

function buildSummary(recipients) {
  return recipients.reduce(
    (totals, recipient) => ({
      monthSalaryAmount: totals.monthSalaryAmount + recipient.month.salaryAmount,
      monthAdvanceAmount: totals.monthAdvanceAmount + recipient.month.advanceAmount,
      monthPaidSalaryAmount: totals.monthPaidSalaryAmount + recipient.month.paidSalaryAmount,
      monthBalance: totals.monthBalance + recipient.month.balance,
      totalSalaryAmount: totals.totalSalaryAmount + recipient.total.salaryAmount,
      totalAdvanceAmount: totals.totalAdvanceAmount + recipient.total.advanceAmount,
      totalPaidSalaryAmount: totals.totalPaidSalaryAmount + recipient.total.paidSalaryAmount,
      totalBalance: totals.totalBalance + recipient.total.balance,
      totalReceivableAmount: totals.totalReceivableAmount + recipient.total.receivableAmount,
    }),
    {
      monthSalaryAmount: 0,
      monthAdvanceAmount: 0,
      monthPaidSalaryAmount: 0,
      monthBalance: 0,
      totalSalaryAmount: 0,
      totalAdvanceAmount: 0,
      totalPaidSalaryAmount: 0,
      totalBalance: 0,
      totalReceivableAmount: 0,
    },
  );
}

export async function getSalaryDashboard(requestedMonth, search) {
  const month = normalizeMonth(requestedMonth);
  const searchRegex = buildSearchRegex(search);
  const [users, teachers, transactions] = await Promise.all([
    User.find(buildUserFilter(searchRegex)).sort({ role: 1, fullName: 1 }),
    Teacher.find(buildTeacherFilter(searchRegex)).sort({ fullName: 1 }),
    EmployeeSalaryTransaction.find({}).sort({ paidAt: -1 }),
  ]);
  const targetKeys = new Set([
    ...users.map((user) => `user:${user._id.toString()}`),
    ...teachers.map((teacher) => `teacher:${teacher._id.toString()}`),
  ]);
  const filteredTransactions = transactions.filter((transaction) =>
    targetKeys.has(`${transaction.targetType}:${transaction.targetId.toString()}`),
  );
  const teacherStats = await buildTeacherStats(teachers, month);
  const recipients = [
    ...users.map((item) => buildRecipient({ targetType: 'user', item, transactions: filteredTransactions, month, teacherStats })),
    ...teachers.map((item) => buildRecipient({ targetType: 'teacher', item, transactions: filteredTransactions, month, teacherStats })),
  ];

  return {
    month,
    summary: buildSummary(recipients),
    recipients,
    allTransactions: filteredTransactions.map(toSalaryTransactionResponse),
    transactions: filteredTransactions
      .filter((transaction) => transaction.month === month)
      .map(toSalaryTransactionResponse),
  };
}

export async function createSalaryTransaction({ targetType, targetId, kind, month, amount, note, createdBy }) {
  if (!['user', 'teacher'].includes(targetType)) {
    return { error: { status: 400, message: "Hodim turi noto'g'ri" } };
  }

  if (!['salary', 'advance', 'salary_payment'].includes(kind)) {
    return { error: { status: 400, message: "Amal turi noto'g'ri" } };
  }

  if (!monthPattern.test(month || '')) {
    return { error: { status: 400, message: "Oy formati YYYY-MM ko'rinishida bo'lishi kerak" } };
  }

  if (amount <= 0) {
    return { error: { status: 400, message: "Summa 0 dan katta bo'lishi kerak" } };
  }

  const target = targetType === 'teacher' ? await Teacher.findById(targetId) : await User.findById(targetId);

  if (!target) {
    return { error: { status: 404, message: 'Hodim topilmadi' } };
  }

  const transaction = await EmployeeSalaryTransaction.create({
    targetType,
    targetId,
    month,
    kind,
    amount,
    paidAt: new Date(),
    note: note?.trim() || '',
    createdBy,
  });

  return { transaction: toSalaryTransactionResponse(transaction) };
}
