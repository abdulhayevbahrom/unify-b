import { Expense } from '../models/expense.model.js';
import { Payment } from '../models/payment.model.js';
import { StudentMonthlyBalance } from '../models/student-monthly-balance.model.js';

function getDateRange(query) {
  const from = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999`) : new Date();
  return { from, to };
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function getFinancialReport(req, res) {
  try {
    const { from, to } = getDateRange(req.query);
    const [payments, expenses, debtRows] = await Promise.all([
      Payment.find({ paidAt: { $gte: from, $lte: to }, status: 'active' }).populate('studentId', 'fullName phone'),
      Expense.find({ spentAt: { $gte: from, $lte: to } }),
      StudentMonthlyBalance.aggregate([{ $match: { debtAmount: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$debtAmount' } } }]),
    ]);
    const income = payments.reduce((sum, item) => sum + item.amount, 0);
    const expense = expenses.reduce((sum, item) => sum + item.amount, 0);
    return res.json({ from, to, income, expense, net: income - expense, debt: debtRows[0]?.total || 0, paymentsCount: payments.length, expensesCount: expenses.length });
  } catch (error) {
    return res.status(500).json({ message: 'Hisobotni olishda xatolik', error: error.message });
  }
}

export async function exportFinancialReport(req, res) {
  try {
    const { from, to } = getDateRange(req.query);
    const payments = await Payment.find({ paidAt: { $gte: from, $lte: to }, status: 'active' }).populate('studentId', 'fullName phone').populate('createdBy', 'fullName').sort({ paidAt: -1 });
    const rows = [['Sana', 'O‘quvchi', 'Telefon', 'Summa', 'Usul', 'Holat', 'Kiritgan', 'Izoh']];
    payments.forEach((item) => rows.push([
      item.paidAt.toISOString(), item.studentId?.fullName || '-', item.studentId?.phone || '-', item.amount,
      item.method, item.status, item.createdBy?.fullName || '-', item.note || '',
    ]));
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="financial-report-${req.query.dateFrom || 'all'}-${req.query.dateTo || 'today'}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ message: 'Eksportda xatolik', error: error.message });
  }
}
