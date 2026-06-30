import { Expense } from '../models/expense.model.js';
import { Payment } from '../models/payment.model.js';
import { StudentMonthlyBalance } from '../models/student-monthly-balance.model.js';
import { buildXlsxBuffer } from '../utils/xlsx.js';

function getDateRange(query) {
  const from = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = query.dateTo ? new Date(`${query.dateTo}T23:59:59.999`) : new Date();
  return { from, to };
}

function formatMoney(value) {
  return Number(value || 0);
}

function formatDate(value) {
  return new Date(value).toLocaleString('uz-UZ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function humanizeMethod(method) {
  return {
    cash: 'Naqd',
    bank_transfer: "Bank o'tkazma",
    click: 'Click',
  }[method] || method;
}

function humanizeStatus(status) {
  return {
    active: 'Faol',
    cancelled: 'Bekor qilingan',
    refunded: 'Qaytarilgan',
  }[status] || status;
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
    const expenses = await Expense.find({ spentAt: { $gte: from, $lte: to } }).sort({ spentAt: -1 });
    const income = payments.reduce((sum, item) => sum + item.amount, 0);
    const expense = expenses.reduce((sum, item) => sum + item.amount, 0);
    const debtRows = await StudentMonthlyBalance.aggregate([{ $match: { debtAmount: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$debtAmount' } } }]);

    const rows = [
      ['Moliyaviy hisobot'],
      ['Davr', `${formatDate(from)} - ${formatDate(to)}`],
      ['Kirim', formatMoney(income)],
      ['Xarajat', formatMoney(expense)],
      ['Sof natija', formatMoney(income - expense)],
      ['Jami qarz', formatMoney(debtRows[0]?.total || 0)],
      [],
      ['To‘lovlar ro‘yxati'],
      ['Sana', 'O‘quvchi', 'Telefon', 'Summa', 'Usul', 'To‘lov holati', 'Kiritgan', 'Izoh'],
      ...payments.map((item) => ([
        formatDate(item.paidAt),
        item.studentId?.fullName || '-',
        item.studentId?.phone || '-',
        formatMoney(item.amount),
        humanizeMethod(item.method),
        humanizeStatus(item.status),
        item.createdBy?.fullName || '-',
        item.note || '',
      ])),
    ];

    const xlsx = buildXlsxBuffer({
      sheetName: 'Hisobot',
      rows,
      widths: [20, 26, 18, 14, 16, 16, 24, 28],
      merges: ['A1:H1', 'A8:H8'],
      autoFilterRef: `A9:H${rows.length}`,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="financial-report-${req.query.dateFrom || 'all'}-${req.query.dateTo || 'today'}.xlsx"`);
    return res.send(xlsx);
  } catch (error) {
    return res.status(500).json({ message: 'Eksportda xatolik', error: error.message });
  }
}
