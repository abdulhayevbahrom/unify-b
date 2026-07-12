import { Expense } from '../models/expense.model.js';
import { Group } from '../models/group.model.js';
import { Payment } from '../models/payment.model.js';
import { StudentMonthlyBalance } from '../models/student-monthly-balance.model.js';
import { Student } from '../models/student.model.js';
import { Teacher } from '../models/teacher.model.js';
import { User } from '../models/user.model.js';
import { EmployeeSalaryTransaction } from '../models/employee-salary-transaction.model.js';
import { getSalaryDashboard } from '../services/salary.service.js';

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const paymentMethods = ['cash', 'bank_transfer', 'click'];

function getCurrentMonth() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonth(month) {
  return monthPattern.test(month || '') ? month : getCurrentMonth();
}

function getCurrentDate() {
  const today = new Date();
  return `${getCurrentMonth()}-${String(today.getDate()).padStart(2, '0')}`;
}

function normalizeDate(date) {
  if (!datePattern.test(date || '')) return getCurrentDate();
  const [year, month, day] = date.split('-').map(Number);
  const normalized = new Date(year, month - 1, day);
  return normalized.getFullYear() === year && normalized.getMonth() === month - 1 && normalized.getDate() === day
    ? date
    : getCurrentDate();
}

function getDateStart(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getMonthStart(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1);
}

function getMonthEnd(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0, 23, 59, 59, 999);
}

function emptyMethodTotals() {
  return Object.fromEntries(paymentMethods.map((method) => [method, 0]));
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function buildMethodTotals(payments) {
  return payments.reduce((totals, payment) => {
    totals[payment.method] = (totals[payment.method] || 0) + payment.amount;
    return totals;
  }, emptyMethodTotals());
}

function getDayKey(date) {
  return String(date.getDate()).padStart(2, '0');
}

function buildDailyTrend({ month, payments, expenses, salaryTransactions }) {
  const daysCount = getMonthEnd(month).getDate();
  const days = Array.from({ length: daysCount }, (_item, index) => {
    const day = String(index + 1).padStart(2, '0');

    return {
      day,
      incomeAmount: 0,
      expenseAmount: 0,
      payrollAmount: 0,
      outflowAmount: 0,
    };
  });
  const dayMap = new Map(days.map((item) => [item.day, item]));

  payments.forEach((payment) => {
    const item = dayMap.get(getDayKey(payment.paidAt));
    if (item) item.incomeAmount += payment.amount;
  });

  expenses.forEach((expense) => {
    const item = dayMap.get(getDayKey(expense.spentAt));
    if (item) item.expenseAmount += expense.amount;
  });

  salaryTransactions.forEach((transaction) => {
    if (!['advance', 'salary_payment'].includes(transaction.kind)) return;

    const item = dayMap.get(getDayKey(transaction.paidAt));
    if (item) item.payrollAmount += transaction.amount;
  });

  return days.map((item) => ({
    ...item,
    outflowAmount: item.expenseAmount + item.payrollAmount,
  }));
}

function toPaymentActivity(payment) {
  const student = payment.studentId;

  return {
    id: payment._id.toString(),
    type: 'payment',
    date: payment.paidAt,
    title: student?.fullName || "O'quvchi to'lovi",
    amount: payment.amount,
    method: payment.method,
    description: student?.groupId?.name || payment.note || '',
  };
}

function toExpenseActivity(expense) {
  return {
    id: expense._id.toString(),
    type: 'expense',
    date: expense.spentAt,
    title: expense.name,
    amount: expense.amount,
    method: expense.method,
    description: expense.category,
  };
}

function toSalaryActivity(transaction, recipientsMap) {
  const key = `${transaction.targetType}:${transaction.targetId.toString()}`;
  const recipient = recipientsMap.get(key);

  return {
    id: transaction._id.toString(),
    type: transaction.kind === 'advance' ? 'advance' : 'salary_payment',
    date: transaction.paidAt,
    title: recipient?.fullName || 'Hodim',
    amount: transaction.amount,
    method: transaction.kind,
    description: transaction.kind === 'advance' ? 'Avans' : 'Oylik berildi',
  };
}

export async function getDashboard(req, res) {
  try {
    const month = normalizeMonth(req.query.month);
    const selectedDate = normalizeDate(req.query.date);
    const monthStart = getMonthStart(month);
    const monthEnd = getMonthEnd(month);
    const selectedDateStart = getDateStart(selectedDate);
    const selectedDateEnd = new Date(selectedDateStart);
    selectedDateEnd.setHours(23, 59, 59, 999);
    const [
      salaryDashboard,
      monthBalances,
      totalDebtRows,
      payments,
      expenses,
      groups,
      teachers,
      users,
      studentsAfterRebuild,
      salaryTransactions,
      selectedDatePayments,
      selectedDateExpenses,
    ] = await Promise.all([
      getSalaryDashboard(month),
      StudentMonthlyBalance.find({ month }),
      StudentMonthlyBalance.aggregate([
        { $match: { month: { $lte: month }, debtAmount: { $gt: 0 } } },
        { $group: { _id: null, totalDebt: { $sum: '$debtAmount' } } },
      ]),
      Payment.find({ paidAt: { $gte: monthStart, $lte: monthEnd }, status: { $nin: ['cancelled', 'refunded'] }, cashStatus: 'approved' })
        .populate({ path: 'studentId', populate: { path: 'groupId' } })
        .sort({ paidAt: -1 }),
      Expense.find({ spentAt: { $gte: monthStart, $lte: monthEnd } }).sort({ spentAt: -1 }),
      Group.find().populate('teacherId').sort({ status: 1, name: 1 }),
      Teacher.find().sort({ fullName: 1 }),
      User.find().sort({ role: 1, fullName: 1 }),
      Student.find().populate('groupId').sort({ createdAt: -1 }),
      EmployeeSalaryTransaction.find({ paidAt: { $gte: monthStart, $lte: monthEnd } }).sort({ paidAt: -1 }),
      Payment.find({ paidAt: { $gte: selectedDateStart, $lte: selectedDateEnd }, status: { $nin: ['cancelled', 'refunded'] }, cashStatus: 'approved' }),
      Expense.find({ spentAt: { $gte: selectedDateStart, $lte: selectedDateEnd } }),
    ]);

    const chargedAmount = sum(monthBalances, 'chargedAmount');
    const allocatedPaidAmount = sum(monthBalances, 'paidAmount');
    const monthDebtAmount = Math.max(chargedAmount - allocatedPaidAmount, 0);
    const incomeAmount = sum(payments, 'amount');
    const expenseAmount = sum(expenses, 'amount');
    const payrollPaidAmount = salaryDashboard.summary.monthAdvanceAmount + salaryDashboard.summary.monthPaidSalaryAmount;
    const recipientsMap = new Map(
      salaryDashboard.recipients.map((recipient) => [`${recipient.targetType}:${recipient.targetId}`, recipient]),
    );
    const studentCounts = studentsAfterRebuild.reduce(
      (counts, student) => {
        counts.total += 1;
        counts[student.status] = (counts[student.status] || 0) + 1;
        if (student.paymentStatus === 'debt') counts.debt += 1;
        return counts;
      },
      { total: 0, active: 0, paused: 0, inactive: 0, left: 0, debt: 0 },
    );
    const groupCounts = groups.reduce(
      (counts, group) => {
        counts.total += 1;
        counts[group.status] = (counts[group.status] || 0) + 1;
        return counts;
      },
      { total: 0, active: 0, inactive: 0, archived: 0 },
    );
    const studentIdsByGroup = monthBalances.reduce((counts, balance) => {
      const groupId = balance.groupId.toString();
      if (!counts.has(groupId)) counts.set(groupId, new Set());
      counts.get(groupId).add(balance.studentId.toString());
      return counts;
    }, new Map());
    const balanceTotalsByGroup = monthBalances.reduce((totals, balance) => {
      const groupId = balance.groupId.toString();
      const current = totals.get(groupId) || { chargedAmount: 0, paidAmount: 0, debtAmount: 0 };
      current.chargedAmount += balance.chargedAmount;
      current.paidAmount += balance.paidAmount;
      current.debtAmount += balance.debtAmount;
      totals.set(groupId, current);
      return totals;
    }, new Map());
    const groupPerformance = groups
      .filter((group) => group.status !== 'archived')
      .map((group) => {
        const groupId = group._id.toString();
        const totals = balanceTotalsByGroup.get(groupId) || { chargedAmount: 0, paidAmount: 0, debtAmount: 0 };

        return {
          id: groupId,
          name: group.name,
          subject: group.subject,
          teacherName: group.teacherId?.fullName || '-',
          studentsCount: studentIdsByGroup.get(groupId)?.size || 0,
          chargedAmount: totals.chargedAmount,
          paidAmount: totals.paidAmount,
          debtAmount: totals.debtAmount,
          paymentPercentage: totals.chargedAmount > 0 ? Math.round((totals.paidAmount / totals.chargedAmount) * 1000) / 10 : 0,
        };
      })
      .sort((first, second) => second.chargedAmount - first.chargedAmount)
      .slice(0, 8);
    const debtors = await StudentMonthlyBalance.aggregate([
      { $match: { month: { $lte: month }, debtAmount: { $gt: 0 } } },
      { $group: { _id: '$studentId', totalDebt: { $sum: '$debtAmount' }, monthsCount: { $sum: 1 } } },
      { $sort: { totalDebt: -1 } },
      { $limit: 8 },
    ]);
    const debtorStudents = await Student.find({ _id: { $in: debtors.map((item) => item._id) } }).populate('groupId');
    const debtorStudentMap = new Map(debtorStudents.map((student) => [student._id.toString(), student]));
    const topDebtors = debtors.map((debt) => {
      const student = debtorStudentMap.get(debt._id.toString());

      return {
        studentId: debt._id.toString(),
        fullName: student?.fullName || '-',
        groupName: student?.groupId?.name || '-',
        phone: student?.phone || '',
        totalDebt: debt.totalDebt,
        monthsCount: debt.monthsCount,
      };
    });
    const recentActivities = [
      ...payments.slice(0, 8).map(toPaymentActivity),
      ...expenses.slice(0, 8).map(toExpenseActivity),
      ...salaryTransactions.slice(0, 8).map((transaction) => toSalaryActivity(transaction, recipientsMap)),
    ]
      .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime())
      .slice(0, 12);
    const dailyTrend = buildDailyTrend({ month, payments, expenses, salaryTransactions });

    return res.json({
      month,
      selectedDate,
      summary: {
        incomeAmount,
        expenseAmount,
        payrollPaidAmount,
        netAmount: incomeAmount - expenseAmount - payrollPaidAmount,
        chargedAmount,
        allocatedPaidAmount,
        monthDebtAmount,
        totalDebtAmount: totalDebtRows[0]?.totalDebt || 0,
        advanceBalanceAmount: sum(studentsAfterRebuild, 'advanceBalance'),
        salaryAccruedAmount: salaryDashboard.summary.monthSalaryAmount,
        salaryPayableAmount: salaryDashboard.summary.totalReceivableAmount,
      },
      day: {
        incomeAmount: sum(selectedDatePayments, 'amount'),
        expenseAmount: sum(selectedDateExpenses, 'amount'),
        netAmount: sum(selectedDatePayments, 'amount') - sum(selectedDateExpenses, 'amount'),
      },
      counts: {
        students: studentCounts,
        groups: groupCounts,
        teachers: {
          total: teachers.length,
          active: teachers.filter((teacher) => teacher.status === 'active').length,
          inactive: teachers.filter((teacher) => teacher.status === 'inactive').length,
        },
        employees: {
          total: users.length,
          active: users.filter((user) => user.status === 'active').length,
          inactive: users.filter((user) => user.status === 'inactive').length,
        },
      },
      payments: {
        totalAmount: incomeAmount,
        count: payments.length,
        totalsByMethod: buildMethodTotals(payments),
      },
      expenses: {
        totalAmount: expenseAmount,
        count: expenses.length,
        totalsByMethod: buildMethodTotals(expenses),
      },
      payroll: {
        accruedAmount: salaryDashboard.summary.monthSalaryAmount,
        advanceAmount: salaryDashboard.summary.monthAdvanceAmount,
        paidSalaryAmount: salaryDashboard.summary.monthPaidSalaryAmount,
        paidAmount: payrollPaidAmount,
        payableAmount: salaryDashboard.summary.totalReceivableAmount,
      },
      groupPerformance,
      topDebtors,
      recentActivities,
      dailyTrend,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Dashboard ma’lumotlarini olishda xatolik', error: error.message });
  }
}
